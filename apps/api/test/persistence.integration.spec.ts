import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { hashAnonymousToken } from '../src/anonymous-sessions/anonymous-sessions.helpers';
import { AnonymousSessionsRepository } from '../src/anonymous-sessions/anonymous-sessions.repository';
import { AnonymousSessionsService } from '../src/anonymous-sessions/anonymous-sessions.service';
import { ChatHistoryService } from '../src/chats/chat-history.service';
import { ChatOwnershipService } from '../src/chats/chat-ownership.service';
import { ChatsRepository } from '../src/chats/chats.repository';
import { ConversationSummaryRepository } from '../src/chats/conversation-summary.repository';
import { RedisLockService } from '../src/chats/redis-lock.service';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { HealthService } from '../src/health/health.service';
import { HealthRepository } from '../src/health/health.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

const anyString = (): string => expect.any(String) as string;

describe('persistence foundation', () => {
  let prisma: PrismaService;
  let redis: RedisService;
  let anonymous_sessions: AnonymousSessionsService;
  let ownership: ChatOwnershipService;
  let locks: RedisLockService;
  let history: ChatHistoryService;
  let health: HealthService;
  let model_id: string;
  const anonymous_session_ids: string[] = [];
  const redis_keys = new Set<string>();

  beforeAll(async () => {
    const environment = validateEnvironment({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
      REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
      COOKIE_SECURE: 'false',
    });
    const config = new ConfigService<AppEnvironment, true>(environment);
    prisma = new PrismaService(config);
    redis = new RedisService(config);
    locks = new RedisLockService(redis, config);
    const anonymousRepository = new AnonymousSessionsRepository(prisma);
    const chatsRepository = new ChatsRepository(prisma);
    anonymous_sessions = new AnonymousSessionsService(
      anonymousRepository,
      config,
    );
    ownership = new ChatOwnershipService(chatsRepository);
    history = new ChatHistoryService(chatsRepository, redis, locks, config);
    health = new HealthService(new HealthRepository(prisma), redis, {
      ping: () => Promise.resolve(),
    } as never);

    await prisma.onModuleInit();
    await redis.onModuleInit();
    model_id = (
      await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
    ).id;
  });

  afterAll(async () => {
    for (const key of redis_keys) {
      await redis.delete(key);
    }
    await prisma.anonymousSession.deleteMany({
      where: { id: { in: anonymous_session_ids } },
    });
    await redis.onApplicationShutdown();
    await prisma.onApplicationShutdown();
  });

  it('creates UUIDv7 records and returns snake_case persistence fields', async () => {
    const session = await createAnonymousSession();

    expect(session.id[14]).toBe('7');
    expect(session.token_hash).toHaveLength(64);
    expect(session.created_at).toBeInstanceOf(Date);
    expect('tokenHash' in session).toBe(false);
  });

  it('enforces exactly one chat owner in PostgreSQL', async () => {
    await expect(
      prisma.chat.create({
        data: {
          title: 'Ownerless chat',
          selected_model_id: model_id,
        },
      }),
    ).rejects.toThrow();
  });

  it('links chats to a model row and blocks deleting a model in use', async () => {
    const session = await createAnonymousSession();
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: session.id,
        title: 'Model link',
        selected_model_id: model_id,
      },
      include: { selected_model: true },
    });

    expect(chat.selected_model.name).toBe('qwen2.5:1.5b');
    expect(chat.selected_model.max_context).toBeGreaterThan(0);
    await expect(
      prisma.model.delete({ where: { id: model_id } }),
    ).rejects.toThrow();
  });

  it('isolates anonymous chat ownership', async () => {
    const owner = await createAnonymousSession();
    const other = await createAnonymousSession();
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: owner.id,
        title: 'Private chat',
        selected_model_id: model_id,
      },
    });

    const owned_chat = await ownership.findOwnedChat({
      chatId: chat.id,
      principal: {
        type: 'anonymous',
        anonymous_session_id: owner.id,
      },
    });
    expect(owned_chat.anonymous_session_id).toBe(owner.id);

    await expect(
      ownership.findOwnedChat({
        chatId: chat.id,
        principal: {
          type: 'anonymous',
          anonymous_session_id: other.id,
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates and resolves an opaque anonymous cookie', async () => {
    const cookie = jest.fn();
    const response = { cookie } as unknown as Response;
    const principal = await anonymous_sessions.create(response);
    anonymous_session_ids.push(principal.anonymous_session_id);

    expect(cookie).toHaveBeenCalledTimes(1);
    const cookie_call = cookie.mock.calls[0] as [string, string, object];
    expect(cookie_call[0]).toBe('anonymous_session');
    expect(cookie_call[1]).not.toContain(principal.anonymous_session_id);
    expect(cookie_call[2]).toEqual(
      expect.objectContaining({ httpOnly: true, path: '/', secure: false }),
    );

    await expect(
      anonymous_sessions.resolvePrincipal(cookie_call[1]),
    ).resolves.toEqual(principal);
    const stored_session = await prisma.anonymousSession.findUniqueOrThrow({
      where: { id: principal.anonymous_session_id },
    });
    expect(stored_session.token_hash).toBe(hashAnonymousToken(cookie_call[1]));
    expect(stored_session.token_hash).not.toBe(cookie_call[1]);
  });

  it('rejects an expired anonymous cookie', async () => {
    const raw_token = randomBytes(32).toString('base64url');
    const session = await prisma.anonymousSession.create({
      data: {
        token_hash: hashAnonymousToken(raw_token),
        expires_at: new Date(Date.now() - 1_000),
      },
    });
    anonymous_session_ids.push(session.id);

    await expect(
      anonymous_sessions.resolvePrincipal(raw_token),
    ).resolves.toBeUndefined();
  });

  it('handles history cache miss, hit, invalidation, and malformed values', async () => {
    const session = await createAnonymousSession();
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: session.id,
        title: 'History cache',
        selected_model_id: model_id,
      },
    });
    redis_keys.add(chat.id);

    const hello = await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'USER',
        status: 'COMPLETED',
        content: 'Hello',
        token_count_source: 'ESTIMATED',
      },
    });

    await expect(history.getHistory(chat.id)).resolves.toEqual([
      { id: hello.id, role: 'user', content: 'Hello' },
    ]);
    await expect(redis.get(chat.id)).resolves.toBe(
      JSON.stringify([{ id: hello.id, role: 'user', content: 'Hello' }]),
    );

    const hi = await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'ASSISTANT',
        status: 'COMPLETED',
        content: 'Hi',
        model: 'qwen2.5:1.5b',
        token_count_source: 'OLLAMA_REPORTED',
      },
    });

    await expect(history.getHistory(chat.id)).resolves.toHaveLength(1);
    await history.invalidate(chat.id);
    await expect(history.getHistory(chat.id)).resolves.toHaveLength(2);

    await redis.setWithTtl({
      key: chat.id,
      value: '{malformed',
      ttlSeconds: 60,
    });
    await expect(history.getHistory(chat.id)).resolves.toEqual([
      { id: hello.id, role: 'user', content: 'Hello' },
      {
        id: hi.id,
        role: 'assistant',
        content: 'Hi',
        model: 'qwen2.5:1.5b',
      },
    ]);

    const followUp = await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'USER',
        status: 'COMPLETED',
        content: 'Cached follow-up',
        token_count_source: 'ESTIMATED',
      },
    });
    await history.append({
      chatId: chat.id,
      entry: {
        id: followUp.id,
        role: 'user',
        content: 'Cached follow-up',
      },
    });
    await expect(redis.get(chat.id)).resolves.toBe(
      JSON.stringify([
        { id: hello.id, role: 'user', content: 'Hello' },
        {
          id: hi.id,
          role: 'assistant',
          content: 'Hi',
          model: 'qwen2.5:1.5b',
        },
        { id: followUp.id, role: 'user', content: 'Cached follow-up' },
      ]),
    );

    await redis.setWithTtl({
      key: chat.id,
      value: JSON.stringify([{ role: 'user', content: 'Hello' }]),
      ttlSeconds: 60,
    });
    await expect(history.getHistory(chat.id)).resolves.toHaveLength(3);
  });

  it('excludes turns whose assistant reply failed or was cancelled from history', async () => {
    const session = await createAnonymousSession();
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: session.id,
        title: 'Incomplete turns',
        selected_model_id: model_id,
      },
    });
    redis_keys.add(chat.id);

    const turns = [
      ['first', 'COMPLETED'],
      ['cancelled prompt', 'CANCELLED'],
      ['failed prompt', 'FAILED'],
      ['last', 'COMPLETED'],
    ] as const;

    for (const [prompt, status] of turns) {
      await prisma.message.create({
        data: {
          chat_id: chat.id,
          role: 'USER',
          status: 'COMPLETED',
          content: prompt,
          token_count_source: 'ESTIMATED',
        },
      });
      await prisma.message.create({
        data: {
          chat_id: chat.id,
          role: 'ASSISTANT',
          status,
          content: `reply to ${prompt}`,
          model: 'qwen2.5:1.5b',
          token_count_source: 'UNKNOWN',
        },
      });
    }

    await expect(history.getHistory(chat.id)).resolves.toEqual([
      { id: anyString(), role: 'user', content: 'first' },
      {
        id: anyString(),
        role: 'assistant',
        content: 'reply to first',
        model: 'qwen2.5:1.5b',
      },
      { id: anyString(), role: 'user', content: 'last' },
      {
        id: anyString(),
        role: 'assistant',
        content: 'reply to last',
        model: 'qwen2.5:1.5b',
      },
    ]);
  });

  it('upserts one conversation summary per chat and finds the last completed reply', async () => {
    const summaries = new ConversationSummaryRepository(prisma);
    const chats_repository = new ChatsRepository(prisma);
    const session = await createAnonymousSession();
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: session.id,
        title: 'Summary',
        selected_model_id: model_id,
      },
    });
    const reply = await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'ASSISTANT',
        status: 'COMPLETED',
        content: 'done',
        model: 'qwen2.5:1.5b',
        prompt_tokens: 100,
        completion_tokens: 20,
        token_count_source: 'OLLAMA_REPORTED',
      },
    });
    await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'ASSISTANT',
        status: 'FAILED',
        content: '',
        model: 'qwen2.5:1.5b',
        token_count_source: 'UNKNOWN',
      },
    });

    await expect(
      chats_repository.findLastCompletedAssistantMessage(chat.id),
    ).resolves.toEqual(expect.objectContaining({ id: reply.id }));
    await expect(summaries.findByChatId(chat.id)).resolves.toBeNull();

    await summaries.upsert({
      chatId: chat.id,
      content: 'first',
      summarizedThroughMessageId: reply.id,
      tokenCount: 3,
    });
    const updated = await summaries.upsert({
      chatId: chat.id,
      content: 'second',
      summarizedThroughMessageId: reply.id,
      tokenCount: 4,
    });

    expect(updated.content).toBe('second');
    await expect(
      prisma.conversationSummary.count({ where: { chat_id: chat.id } }),
    ).resolves.toBe(1);
  });

  it('does not allow two holders of the same Redis lock', async () => {
    const key = `test-lock:${randomBytes(12).toString('hex')}`;
    redis_keys.add(key);
    const first = await locks.acquire({ key, ttlMs: 5_000 });
    expect(first).toBeDefined();
    await expect(first?.extend(10_000)).resolves.toBe(true);
    await expect(locks.acquire({ key, ttlMs: 5_000 })).resolves.toBeUndefined();
    await expect(first?.release()).resolves.toBe(true);

    const next = await locks.acquire({ key, ttlMs: 5_000 });
    expect(next).toBeDefined();
    await next?.release();
  });

  it('reports PostgreSQL and Redis readiness', async () => {
    await expect(health.readiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'up', redis: 'up', ollama: 'up' },
    });
  });

  async function createAnonymousSession() {
    const session = await prisma.anonymousSession.create({
      data: {
        token_hash: randomBytes(32).toString('hex'),
        expires_at: new Date(Date.now() + 60_000),
      },
    });
    anonymous_session_ids.push(session.id);
    return session;
  }
});
