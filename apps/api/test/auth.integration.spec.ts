import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AnonymousSessionsService } from '../src/anonymous-sessions/anonymous-sessions.service';
import { AnonymousSessionsRepository } from '../src/anonymous-sessions/anonymous-sessions.repository';
import { AuthCookieService } from '../src/auth/auth-cookie.service';
import { AuthRepository } from '../src/auth/auth.repository';
import { AuthService } from '../src/auth/auth.service';
import { ChatHistoryService } from '../src/chats/chat-history.service';
import { ChatsRepository } from '../src/chats/chats.repository';
import { RedisLockService } from '../src/chats/redis-lock.service';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

describe('authentication sessions', () => {
  let prisma: PrismaService;
  let redis: RedisService;
  let auth: AuthService;
  let anonymousSessions: AnonymousSessionsService;
  let authCookies: AuthCookieService;
  const userIds: string[] = [];

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
    const anonymousRepository = new AnonymousSessionsRepository(prisma);
    const chatsRepository = new ChatsRepository(prisma);
    anonymousSessions = new AnonymousSessionsService(
      anonymousRepository,
      config,
    );
    authCookies = new AuthCookieService(config);
    const locks = new RedisLockService(redis, config);
    const history = new ChatHistoryService(
      chatsRepository,
      redis,
      locks,
      config,
    );
    auth = new AuthService(
      new AuthRepository(prisma),
      new JwtService(),
      authCookies,
      anonymousSessions,
      history,
      config,
    );
    await prisma.onModuleInit();
    await redis.onModuleInit();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await redis.onApplicationShutdown();
    await prisma.onApplicationShutdown();
  });

  it('supports independent devices, rotation reuse detection, and revocation', async () => {
    const email = `auth-${randomBytes(8).toString('hex')}@example.com`;
    const firstResponse = createResponse();
    const firstUser = await auth.signUp({
      input: { email, password: 'correct horse battery staple' },
      request: createRequest('First device'),
      response: firstResponse.response,
    });
    userIds.push(firstUser.id);
    const firstTokens = getAuthTokens(firstResponse.cookie);

    await expect(
      auth.authenticateAccess(firstTokens.accessToken),
    ).resolves.toEqual(expect.objectContaining({ user_id: firstUser.id }));

    const secondResponse = createResponse();
    await auth.signIn({
      input: { email, password: 'correct horse battery staple' },
      request: createRequest('Second device'),
      response: secondResponse.response,
    });
    const secondTokens = getAuthTokens(secondResponse.cookie);
    const secondPrincipal = await auth.authenticateAccess(
      secondTokens.accessToken,
    );
    const firstPrincipal = await auth.authenticateAccess(
      firstTokens.accessToken,
    );
    const firstSession = await prisma.authSession.findUniqueOrThrow({
      where: { id: firstPrincipal.auth_session_id },
    });

    expect(firstUser.id[14]).toBe('7');
    expect(firstSession.id[14]).toBe('7');
    expect(firstSession.refresh_jti[14]).toBe('7');

    await expect(
      auth.listSessions({
        userId: firstUser.id,
        currentSessionId: firstPrincipal.auth_session_id,
      }),
    ).resolves.toHaveLength(2);

    const rotatedResponse = createResponse();
    await auth.refresh({
      rawToken: firstTokens.refreshToken,
      request: createRequest('First device'),
      response: rotatedResponse.response,
    });
    const rotatedTokens = getAuthTokens(rotatedResponse.cookie);

    await expect(
      auth.refresh({
        rawToken: firstTokens.refreshToken,
        request: createRequest('First device'),
        response: createResponse().response,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.authenticateAccess(rotatedTokens.accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await auth.revokeOwnedSession({
      userId: firstUser.id,
      sessionId: secondPrincipal.auth_session_id,
    });
    await expect(
      auth.authenticateAccess(secondTokens.accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('transfers anonymous chats exactly once during sign-up', async () => {
    const anonymousResponse = createResponse();
    const principal = await anonymousSessions.create(
      anonymousResponse.response,
    );
    const chat = await prisma.chat.create({
      data: {
        anonymous_session_id: principal.anonymous_session_id,
        title: 'Transfer me',
        selected_model: 'qwen2.5:1.5b',
      },
    });
    const user = await auth.signUp({
      input: {
        email: `transfer-${randomBytes(8).toString('hex')}@example.com`,
        password: 'correct horse battery staple',
      },
      principal,
      request: createRequest('Transfer device'),
      response: createResponse().response,
    });
    userIds.push(user.id);

    await expect(
      prisma.chat.findUniqueOrThrow({ where: { id: chat.id } }),
    ).resolves.toEqual(
      expect.objectContaining({
        user_id: user.id,
        anonymous_session_id: null,
      }),
    );
    await expect(
      prisma.anonymousSession.findUnique({
        where: { id: principal.anonymous_session_id },
      }),
    ).resolves.toBeNull();
  });

  function getAuthTokens(cookie: jest.Mock): {
    accessToken: string;
    refreshToken: string;
  } {
    const calls = cookie.mock.calls as [string, string][];
    const accessToken = calls.find(
      ([name]) => name === authCookies.accessCookieName,
    )?.[1];
    const refreshToken = calls.find(
      ([name]) => name === authCookies.refreshCookieName,
    )?.[1];

    if (!accessToken || !refreshToken) {
      throw new Error('Authentication cookies were not set.');
    }
    return { accessToken, refreshToken };
  }
});

function createRequest(userAgent: string): Request {
  return {
    ip: '127.0.0.1',
    get: (name: string) =>
      name.toLowerCase() === 'user-agent' ? userAgent : undefined,
  } as Request;
}

function createResponse(): {
  response: Response;
  cookie: jest.Mock;
  clearCookie: jest.Mock;
} {
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  return {
    response: { cookie, clearCookie } as unknown as Response,
    cookie,
    clearCookie,
  };
}
