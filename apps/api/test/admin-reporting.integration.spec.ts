import { randomBytes } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { AdminAnonymousSessionsRepository } from '../src/admin/anonymous-sessions/admin-anonymous-sessions.repository';
import { AdminAnonymousSessionsService } from '../src/admin/anonymous-sessions/admin-anonymous-sessions.service';
import { AdminUsersRepository } from '../src/admin/users/admin-users.repository';
import { AdminUsersService } from '../src/admin/users/admin-users.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsageReportingService } from '../src/usage/usage-reporting.service';
import { UsageRepository } from '../src/usage/usage.repository';
import { ensureDefaultModel } from './models.test-helpers';

describe('usage reporting', () => {
  let prisma: PrismaService;
  let reporting: UsageReportingService;
  let model_id: string;
  let anonymousId: string;

  beforeAll(async () => {
    const config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
      }),
    );
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    await ensureDefaultModel(prisma);
    reporting = new UsageReportingService(new UsageRepository(prisma));
    model_id = (
      await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
    ).id;
    const session = await prisma.anonymousSession.create({
      data: {
        token_hash: randomBytes(32).toString('hex'),
        expires_at: new Date(Date.now() + 86_400_000),
      },
    });
    anonymousId = session.id;
    const row = (
      kind: 'CHAT' | 'SUMMARY',
      input: number,
      output: number,
      at: string,
    ) => ({
      anonymous_session_id: anonymousId,
      model_id,
      kind,
      input_tokens: input,
      output_tokens: output,
      created_at: new Date(at),
    });
    await prisma.usageLog.createMany({
      data: [
        row('CHAT', 100, 10, '2026-09-01T10:00:00Z'),
        row('CHAT', 200, 20, '2026-09-15T10:00:00Z'),
        row('SUMMARY', 50, 5, '2026-09-20T10:00:00Z'),
      ],
    });
  });

  afterAll(async () => {
    await prisma.usageLog.deleteMany({
      where: { anonymous_session_id: anonymousId },
    });
    await prisma.anonymousSession.delete({ where: { id: anonymousId } });
    await prisma.onApplicationShutdown();
  });

  const owner = () => ({ type: 'anonymous' as const, id: anonymousId });

  it('totals all rows', async () => {
    await expect(
      reporting.getTotals({ owner: owner(), range: {} }),
    ).resolves.toEqual({
      requests: 3,
      inputTokens: 350,
      outputTokens: 35,
      totalTokens: 385,
      lastActivityAt: '2026-09-20T10:00:00.000Z',
    });
  });

  it('applies from-inclusive / to-exclusive ranges', async () => {
    const totals = await reporting.getTotals({
      owner: owner(),
      range: {
        from: new Date('2026-09-15T10:00:00Z'),
        to: new Date('2026-09-20T10:00:00Z'),
      },
    });
    expect(totals).toMatchObject({ requests: 1, inputTokens: 200 });
  });

  it('returns zero totals for an owner with no usage', async () => {
    await expect(
      reporting.getTotals({
        owner: { type: 'user', id: '00000000-0000-7000-8000-000000000000' },
        range: {},
      }),
    ).resolves.toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      lastActivityAt: null,
    });
  });

  it('breaks down by model and kind', async () => {
    const breakdown = await reporting.getBreakdown({
      owner: owner(),
      range: {},
    });
    expect(breakdown).toEqual(
      expect.arrayContaining([
        {
          model: 'qwen2.5:1.5b',
          kind: 'chat',
          requests: 2,
          inputTokens: 300,
          outputTokens: 30,
        },
        {
          model: 'qwen2.5:1.5b',
          kind: 'summary',
          requests: 1,
          inputTokens: 50,
          outputTokens: 5,
        },
      ]),
    );
  });

  it('paginates rows newest first', async () => {
    const page = await reporting.listRows({
      owner: owner(),
      range: {},
      page: { page: 2, pageSize: 2 },
    });
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      model: 'qwen2.5:1.5b',
      kind: 'chat',
      inputTokens: 100,
      createdAt: '2026-09-01T10:00:00.000Z',
      chatId: null,
    });
  });
});

describe('admin lists', () => {
  let prisma: PrismaService;
  let users: AdminUsersService;
  let anonymous: AdminAnonymousSessionsService;
  const hex = randomBytes(6).toString('hex');
  const emailA = `list-${hex}-a@example.com`;
  const emailB = `list-${hex}-b@example.com`;
  const emailC = `list-${hex}-c@example.com`;
  let userA: { id: string };
  let userB: { id: string };
  let userC: { id: string };
  let activeSessionId: string;
  let emptySessionId: string;

  beforeAll(async () => {
    const config = new ConfigService<AppEnvironment, true>(
      validateEnvironment({
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:postgres@localhost:5432/js_rag_stack?schema=public',
      }),
    );
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
    const reporting = new UsageReportingService(new UsageRepository(prisma));
    users = new AdminUsersService(new AdminUsersRepository(prisma), reporting);
    anonymous = new AdminAnonymousSessionsService(
      new AdminAnonymousSessionsRepository(prisma),
      reporting,
    );
    const modelId = (
      await prisma.model.findUniqueOrThrow({ where: { name: 'qwen2.5:1.5b' } })
    ).id;
    const create = (email: string) =>
      prisma.user.create({ data: { email, password_hash: 'x' } });
    userA = await create(emailA);
    userB = await create(emailB);
    userC = await create(emailC);
    const sessionData = () => ({
      token_hash: randomBytes(32).toString('hex'),
      expires_at: new Date(Date.now() + 86_400_000),
    });
    activeSessionId = (
      await prisma.anonymousSession.create({ data: sessionData() })
    ).id;
    emptySessionId = (
      await prisma.anonymousSession.create({ data: sessionData() })
    ).id;
    await prisma.usageLog.createMany({
      data: [
        {
          user_id: userA.id,
          model_id: modelId,
          kind: 'CHAT',
          input_tokens: 100,
          output_tokens: 10,
          created_at: new Date('2026-09-10T00:00:00Z'),
        },
        {
          user_id: userB.id,
          model_id: modelId,
          kind: 'CHAT',
          input_tokens: 1000,
          output_tokens: 100,
          created_at: new Date('2026-09-05T00:00:00Z'),
        },
        {
          anonymous_session_id: activeSessionId,
          model_id: modelId,
          kind: 'CHAT',
          input_tokens: 5,
          output_tokens: 5,
          created_at: new Date('2026-09-06T00:00:00Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.usageLog.deleteMany({
      where: {
        OR: [
          { user_id: { in: [userA.id, userB.id, userC.id] } },
          { anonymous_session_id: activeSessionId },
        ],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userA.id, userB.id, userC.id] } },
    });
    await prisma.anonymousSession.deleteMany({
      where: { id: { in: [activeSessionId, emptySessionId] } },
    });
    await prisma.onApplicationShutdown();
  });

  it('sorts users by total tokens, zero-usage last, with numbers not strings', async () => {
    const page = await users.list({
      search: hex,
      sort: 'totalTokens',
      range: {},
      page: { page: 1, pageSize: 25 },
    });
    expect(page.items.map((u) => u.email)).toEqual([emailB, emailA, emailC]);
    expect(page.items[0]?.usage).toEqual({
      requests: 1,
      inputTokens: 1000,
      outputTokens: 100,
      totalTokens: 1100,
      lastActivityAt: '2026-09-05T00:00:00.000Z',
    });
    expect(typeof page.items[0]?.usage.inputTokens).toBe('number');
    expect(page.items[2]?.usage).toMatchObject({
      requests: 0,
      totalTokens: 0,
      lastActivityAt: null,
    });
    expect(page.total).toBe(3);
  });

  it('sorts by last activity with nulls last and paginates', async () => {
    const page = await users.list({
      search: hex,
      sort: 'lastActivity',
      range: {},
      page: { page: 1, pageSize: 2 },
    });
    expect(page.items.map((u) => u.email)).toEqual([emailA, emailB]);
    expect(page.total).toBe(3);
  });

  it('applies the date range to totals', async () => {
    const page = await users.list({
      search: hex,
      sort: 'totalTokens',
      range: { from: new Date('2026-09-08T00:00:00Z') },
      page: { page: 1, pageSize: 25 },
    });
    expect(page.items[0]?.email).toBe(emailA);
  });

  it('treats search wildcards literally', async () => {
    const page = await users.list({
      search: '%',
      sort: 'createdAt',
      range: {},
      page: { page: 1, pageSize: 25 },
    });
    expect(page.items.every((u) => u.email.includes('%'))).toBe(true);
  });

  it('returns user detail and 404 for unknown users', async () => {
    const detail = await users.get({ id: userA.id, range: {} });
    expect(detail.usage.inputTokens).toBe(100);
    expect(detail.breakdown).toHaveLength(1);
    await expect(
      users.get({ id: '00000000-0000-7000-8000-000000000000', range: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists only anonymous sessions with usage or chats', async () => {
    const page = await anonymous.list({
      sort: 'createdAt',
      range: {},
      page: { page: 1, pageSize: 100 },
    });
    const ids = page.items.map((s) => s.id);
    expect(ids).toContain(activeSessionId);
    expect(ids).not.toContain(emptySessionId);
  });
});
