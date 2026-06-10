import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import {
  AnonymousSessionsService,
  hash_token,
} from '../src/anonymous-sessions/anonymous-sessions.service';
import { ChatHistoryService } from '../src/chats/chat-history.service';
import { ChatOwnershipService } from '../src/chats/chat-ownership.service';
import { RedisLockService } from '../src/chats/redis-lock.service';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

describe('persistence foundation', () => {
  let prisma: PrismaService;
  let redis: RedisService;
  let anonymous_sessions: AnonymousSessionsService;
  let ownership: ChatOwnershipService;
  let locks: RedisLockService;
  let history: ChatHistoryService;
  let health: HealthService;
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
    anonymous_sessions = new AnonymousSessionsService(prisma, config);
    ownership = new ChatOwnershipService(prisma);
    history = new ChatHistoryService(prisma, redis, locks, config);
    health = new HealthService(prisma, redis);

    await prisma.onModuleInit();
    await redis.onModuleInit();
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
    const session = await create_anonymous_session();

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
          selected_model: 'qwen2.5:1.5b',
        },
      }),
    ).rejects.toThrow();
  });

  it('isolates anonymous chat ownership', async () => {
    const owner = await create_anonymous_session();
    const other = await create_anonymous_session();
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: owner.id,
        title: 'Private chat',
        selected_model: 'qwen2.5:1.5b',
      },
    });

    const owned_chat = await ownership.find_owned_chat(chat.id, {
      type: 'anonymous',
      anonymous_session_id: owner.id,
    });
    expect(owned_chat.anonymous_session_id).toBe(owner.id);

    await expect(
      ownership.find_owned_chat(chat.id, {
        type: 'anonymous',
        anonymous_session_id: other.id,
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
      anonymous_sessions.resolve_principal(cookie_call[1]),
    ).resolves.toEqual(principal);
    const stored_session = await prisma.anonymousSession.findUniqueOrThrow({
      where: { id: principal.anonymous_session_id },
    });
    expect(stored_session.token_hash).toBe(hash_token(cookie_call[1]));
    expect(stored_session.token_hash).not.toBe(cookie_call[1]);
  });

  it('rejects an expired anonymous cookie', async () => {
    const raw_token = randomBytes(32).toString('base64url');
    const session = await prisma.anonymousSession.create({
      data: {
        token_hash: hash_token(raw_token),
        expires_at: new Date(Date.now() - 1_000),
      },
    });
    anonymous_session_ids.push(session.id);

    await expect(
      anonymous_sessions.resolve_principal(raw_token),
    ).resolves.toBeUndefined();
  });

  it('handles history cache miss, hit, invalidation, and malformed values', async () => {
    const session = await create_anonymous_session();
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: session.id,
        title: 'History cache',
        selected_model: 'qwen2.5:1.5b',
      },
    });
    redis_keys.add(chat.id);

    await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'USER',
        status: 'COMPLETED',
        content: 'Hello',
        token_count_source: 'ESTIMATED',
      },
    });

    await expect(history.get_history(chat.id)).resolves.toEqual([
      { role: 'user', content: 'Hello' },
    ]);
    await expect(redis.get(chat.id)).resolves.toBe(
      JSON.stringify([{ role: 'user', content: 'Hello' }]),
    );

    await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'ASSISTANT',
        status: 'COMPLETED',
        content: 'Hi',
        model: 'qwen2.5:1.5b',
        token_count_source: 'OLLAMA_REPORTED',
      },
    });

    await expect(history.get_history(chat.id)).resolves.toHaveLength(1);
    await history.invalidate(chat.id);
    await expect(history.get_history(chat.id)).resolves.toHaveLength(2);

    await redis.set_with_ttl(chat.id, '{malformed', 60);
    await expect(history.get_history(chat.id)).resolves.toEqual([
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: 'Hi',
        model: 'qwen2.5:1.5b',
      },
    ]);

    await prisma.message.create({
      data: {
        chat_id: chat.id,
        role: 'USER',
        status: 'COMPLETED',
        content: 'Cached follow-up',
        token_count_source: 'ESTIMATED',
      },
    });
    await history.append(chat.id, {
      role: 'user',
      content: 'Cached follow-up',
    });
    await expect(redis.get(chat.id)).resolves.toBe(
      JSON.stringify([
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'Hi',
          model: 'qwen2.5:1.5b',
        },
        { role: 'user', content: 'Cached follow-up' },
      ]),
    );
  });

  it('does not allow two holders of the same Redis lock', async () => {
    const key = `test-lock:${randomBytes(12).toString('hex')}`;
    redis_keys.add(key);
    const first = await locks.acquire(key, 5_000);
    expect(first).toBeDefined();
    await expect(first?.extend(10_000)).resolves.toBe(true);
    await expect(locks.acquire(key, 5_000)).resolves.toBeUndefined();
    await expect(first?.release()).resolves.toBe(true);

    const next = await locks.acquire(key, 5_000);
    expect(next).toBeDefined();
    await next?.release();
  });

  it('reports PostgreSQL and Redis readiness', async () => {
    await expect(health.readiness()).resolves.toEqual({
      status: 'ready',
      checks: { database: 'up', redis: 'up' },
    });
  });

  async function create_anonymous_session() {
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
