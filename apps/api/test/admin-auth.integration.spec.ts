import { randomBytes } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AdminAccountsRepository } from '../src/admin/auth/admin-accounts.repository';
import { AdminAccountsService } from '../src/admin/auth/admin-accounts.service';
import { AdminAuthGuard } from '../src/admin/auth/admin-auth.guard';
import { AdminAuthService } from '../src/admin/auth/admin-auth.service';
import { AdminCookieService } from '../src/admin/auth/admin-cookie.service';
import { AdminSessionsRepository } from '../src/admin/auth/admin-sessions.repository';
import { AdminTokenService } from '../src/admin/auth/admin-token.service';
import { Argon2PasswordHasher } from '../src/common/security/password-hasher';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { PrismaService } from '../src/prisma/prisma.service';

describe('admin authentication', () => {
  let prisma: PrismaService;
  let config: ConfigService<AppEnvironment, true>;
  let auth: AdminAuthService;
  let accounts: AdminAccountsService;
  let cookies: AdminCookieService;
  const emails: string[] = [];
  const password = 'admin-password-123';

  function response() {
    const jar: Record<string, string> = {};
    const res = {
      cookie: jest.fn((name: string, value: string) => {
        jar[name] = value;
      }),
      clearCookie: jest.fn(),
    } as unknown as Response;
    return { res, jar };
  }

  async function createAdmin() {
    const email = `admin-${randomBytes(6).toString('hex')}@example.com`;
    emails.push(email);
    await accounts.upsert({ email, password });
    return email;
  }

  beforeAll(async () => {
    config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
        COOKIE_SECURE: 'false',
      }),
    );
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    const hasher = new Argon2PasswordHasher();
    const accountsRepository = new AdminAccountsRepository(prisma);
    cookies = new AdminCookieService(config);
    accounts = new AdminAccountsService(accountsRepository, hasher);
    auth = new AdminAuthService(
      accountsRepository,
      new AdminSessionsRepository(prisma),
      new AdminTokenService(new JwtService(), config),
      cookies,
      hasher,
      config,
    );
  });

  afterAll(async () => {
    await prisma.admin.deleteMany({ where: { email: { in: emails } } });
    await prisma.onApplicationShutdown();
  });

  it('signs in, authenticates, refreshes with rotation, and signs out', async () => {
    const email = await createAdmin();
    const first = response();
    const profile = await auth.signIn({
      input: { email: email.toUpperCase(), password },
      response: first.res,
    });
    expect(profile.email).toBe(email);
    const access = first.jar[cookies.accessCookieName];
    const refresh = first.jar[cookies.refreshCookieName];
    expect(access).toEqual(expect.any(String));

    const principal = await auth.authenticate(access!);
    expect(principal.admin_id).toBe(profile.id);

    const second = response();
    await auth.refresh({ rawToken: refresh!, response: second.res });
    await expect(
      auth.refresh({ rawToken: refresh!, response: response().res }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const rotatedPrincipal = await auth.authenticate(
      second.jar[cookies.accessCookieName]!,
    );
    await auth.signOut({
      principal: rotatedPrincipal,
      response: response().res,
    });
    await expect(
      auth.authenticate(second.jar[cookies.accessCookieName]!),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses one generic message for unknown email and wrong password', async () => {
    const email = await createAdmin();
    await expect(
      auth.signIn({
        input: { email, password: 'wrong-password!' },
        response: response().res,
      }),
    ).rejects.toThrow('Invalid email or password.');
    await expect(
      auth.signIn({
        input: { email: 'nobody@example.com', password },
        response: response().res,
      }),
    ).rejects.toThrow('Invalid email or password.');
  });

  it('rejects user access tokens and missing cookies at the guard', async () => {
    const userToken = await new JwtService().signAsync(
      { sub: 'u', sessionId: 's', jti: 'j', type: 'access' },
      { secret: config.get('JWT_ACCESS_SECRET', { infer: true }) },
    );
    const guard = new AdminAuthGuard(auth, cookies);
    const context = (cookieJar: Record<string, string>) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ cookies: cookieJar }) as unknown as Request,
        }),
      }) as never;

    await expect(
      guard.canActivate(context({ access_token: userToken })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(context({ [cookies.accessCookieName]: userToken })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects admin-secret tokens without the admin audience and refresh tokens as access', async () => {
    const email = await createAdmin();
    const signed = response();
    const profile = await auth.signIn({
      input: { email, password },
      response: signed.res,
    });
    const principal = await auth.authenticate(
      signed.jar[cookies.accessCookieName]!,
    );
    const noAudience = await new JwtService().signAsync(
      {
        sub: profile.id,
        sessionId: principal.admin_session_id,
        jti: 'j',
        type: 'access',
      },
      { secret: config.get('ADMIN_JWT_SECRET', { infer: true }) },
    );
    await expect(auth.authenticate(noAudience)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      auth.authenticate(signed.jar[cookies.refreshCookieName]!),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('upsert creates then resets the password; rejects short passwords', async () => {
    const email = await createAdmin();
    await accounts.upsert({ email, password: 'a-brand-new-password' });
    await expect(
      auth.signIn({ input: { email, password }, response: response().res }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.signIn({
        input: { email, password: 'a-brand-new-password' },
        response: response().res,
      }),
    ).resolves.toMatchObject({ email });
    await expect(accounts.upsert({ email, password: 'short' })).rejects.toThrow(
      'Admin passwords must be at least 12 characters.',
    );
  });
});
