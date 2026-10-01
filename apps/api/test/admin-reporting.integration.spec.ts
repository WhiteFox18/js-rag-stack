import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsageReportingService } from '../src/usage/usage-reporting.service';
import { UsageRepository } from '../src/usage/usage.repository';

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
