import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AnonymousSessionsRepository } from '../src/anonymous-sessions/anonymous-sessions.repository';
import { AnonymousSessionsService } from '../src/anonymous-sessions/anonymous-sessions.service';
import { AuthCookieService } from '../src/auth/auth-cookie.service';
import { AuthRepository } from '../src/auth/auth.repository';
import { AuthService } from '../src/auth/auth.service';
import { ChatHistoryService } from '../src/chats/chat-history.service';
import { ChatsRepository } from '../src/chats/chats.repository';
import { RedisLockService } from '../src/chats/redis-lock.service';
import { Argon2PasswordHasher } from '../src/common/security/password-hasher';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { UsageRecorderService } from '../src/usage/usage-recorder.service';
import { UsageRepository } from '../src/usage/usage.repository';
import { UsageTransferService } from '../src/usage/usage-transfer.service';
import { ensureDefaultModel } from './models.test-helpers';

describe('usage recording', () => {
  let prisma: PrismaService;
  let redis: RedisService;
  let recorder: UsageRecorderService;
  let auth: AuthService;
  let anonymousSessions: AnonymousSessionsService;
  let model_id: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    const config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
        COOKIE_SECURE: 'false',
      }),
    );
    prisma = new PrismaService(config);
    redis = new RedisService(config);
    const usageRepository = new UsageRepository(prisma);
    recorder = new UsageRecorderService(usageRepository);
    anonymousSessions = new AnonymousSessionsService(
      new AnonymousSessionsRepository(prisma),
      config,
    );
    const chats = new ChatsRepository(prisma);
    const locks = new RedisLockService(redis, config);
    auth = new AuthService(
      new AuthRepository(prisma, new UsageTransferService(usageRepository)),
      new JwtService(),
      new AuthCookieService(config),
      anonymousSessions,
      new ChatHistoryService(chats, redis, locks, config),
      new Argon2PasswordHasher(),
      config,
    );
    await prisma.onModuleInit();
    await redis.onModuleInit();
    await ensureDefaultModel(prisma);
    model_id = (
      await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
    ).id;
  });

  afterAll(async () => {
    await prisma.usageLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await redis.onApplicationShutdown();
    await prisma.onApplicationShutdown();
  });

  function response(): Response {
    return { cookie: jest.fn(), clearCookie: jest.fn() } as unknown as Response;
  }

  function request(): Request {
    return { get: () => undefined, ip: '127.0.0.1' } as unknown as Request;
  }

  async function anonymousWithUsage() {
    const principal = await anonymousSessions.create(response());
    await recorder.record({
      principal,
      chatId: null,
      modelId: model_id,
      kind: 'CHAT',
      inputTokens: 100,
      outputTokens: 20,
    });
    await recorder.record({
      principal,
      chatId: null,
      modelId: model_id,
      kind: 'SUMMARY',
      inputTokens: 50,
      outputTokens: undefined,
    });
    return principal;
  }

  it('records chat and summary rows for an anonymous principal, missing counts as 0', async () => {
    const principal = await anonymousWithUsage();
    const rows = await prisma.usageLog.findMany({
      where: { anonymous_session_id: principal.anonymous_session_id },
      orderBy: { created_at: 'asc' },
    });
    expect(rows.map((r) => [r.kind, r.input_tokens, r.output_tokens])).toEqual([
      ['CHAT', 100, 20],
      ['SUMMARY', 50, 0],
    ]);
    await prisma.anonymousSession.delete({
      where: { id: principal.anonymous_session_id },
    });
  });

  it('never throws when the write fails', async () => {
    await expect(
      recorder.record({
        principal: {
          type: 'anonymous',
          anonymous_session_id: '00000000-0000-7000-8000-000000000000',
        },
        chatId: null,
        modelId: model_id,
        kind: 'CHAT',
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('moves anonymous usage to the user on sign-up', async () => {
    const principal = await anonymousWithUsage();
    const user = await auth.signUp({
      input: {
        email: `usage-${randomBytes(6).toString('hex')}@example.com`,
        password: 'a-long-enough-password',
      },
      principal,
      request: request(),
      response: response(),
    });
    userIds.push(user.id);
    const rows = await prisma.usageLog.findMany({
      where: { user_id: user.id },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.anonymous_session_id === null)).toBe(true);
  });

  it('moves anonymous usage to the user on sign-in', async () => {
    const email = `usage-${randomBytes(6).toString('hex')}@example.com`;
    const user = await auth.signUp({
      input: { email, password: 'a-long-enough-password' },
      request: request(),
      response: response(),
    });
    userIds.push(user.id);
    const principal = await anonymousWithUsage();
    await auth.signIn({
      input: { email, password: 'a-long-enough-password' },
      principal,
      request: request(),
      response: response(),
    });
    expect(await prisma.usageLog.count({ where: { user_id: user.id } })).toBe(
      2,
    );
  });

  it('attributes chat usage to the chat owner, not the request principal', async () => {
    const owner = await prisma.user.create({
      data: {
        email: `usage-${randomBytes(6).toString('hex')}@example.com`,
        password_hash: 'x',
      },
    });
    userIds.push(owner.id);
    const chat = await prisma.chat.create({
      data: { user_id: owner.id, title: 't', selected_model_id: model_id },
    });
    const stale = await anonymousSessions.create(response());
    await recorder.record({
      principal: stale,
      chatId: chat.id,
      modelId: model_id,
      kind: 'CHAT',
      inputTokens: 5,
      outputTokens: 5,
    });
    const rows = await prisma.usageLog.findMany({
      where: { chat_id: chat.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: owner.id,
      anonymous_session_id: null,
    });
    await prisma.anonymousSession.delete({
      where: { id: stale.anonymous_session_id },
    });
  });
});
