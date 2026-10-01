import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { ModelCatalogService } from '../src/models/model-catalog.service';
import { ModelDefaultSeeder } from '../src/models/model-default.seeder';
import { ModelsRepository } from '../src/models/models.repository';
import { OllamaError } from '../src/ollama/ollama.errors';
import { PrismaService } from '../src/prisma/prisma.service';

describe('model catalog', () => {
  let prisma: PrismaService;
  let repository: ModelsRepository;
  let config: ConfigService<AppEnvironment, true>;
  const created: string[] = [];
  const installed = jest.fn<Promise<string[]>, []>();

  function catalog() {
    return new ModelCatalogService(repository, {
      listInstalledModels: installed,
    } as never);
  }

  async function createModel(overrides: { is_available?: boolean } = {}) {
    const model = await prisma.model.create({
      data: {
        name: `test-${randomBytes(4).toString('hex')}`,
        max_context: 4096,
        ...overrides,
      },
    });
    created.push(model.id);
    return model;
  }

  beforeAll(async () => {
    config = new ConfigService<AppEnvironment, true>(
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
    repository = new ModelsRepository(prisma);
  });

  afterAll(async () => {
    await prisma.model.deleteMany({ where: { id: { in: created } } });
    await prisma.onApplicationShutdown();
  });

  it('lists only available and installed models, flagging the DB default', async () => {
    const available = await createModel();
    const disabled = await createModel({ is_available: false });
    installed.mockResolvedValue([
      'qwen2.5:1.5b',
      available.name,
      disabled.name,
    ]);

    const names = (await catalog().listSelectable()).map((m) => m.name);
    expect(names).toContain(available.name);
    expect(names).not.toContain(disabled.name);
    const qwen = (await catalog().listSelectable()).find(
      (m) => m.name === 'qwen2.5:1.5b',
    );
    expect(qwen).toEqual({
      name: 'qwen2.5:1.5b',
      default: true,
      maxContext: expect.any(Number) as number,
    });
  });

  it('rejects unknown and disabled models for generation', async () => {
    const disabled = await createModel({ is_available: false });
    await expect(
      catalog().resolveForGeneration(
        `unknown-${randomBytes(4).toString('hex')}`,
      ),
    ).rejects.toMatchObject({
      code: 'MODEL_NOT_ALLOWED',
      status: 400,
    });
    const error = await catalog()
      .resolveForGeneration(disabled.name)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OllamaError);
    expect(error).toMatchObject({ code: 'MODEL_NOT_AVAILABLE', status: 409 });
  });

  it('seeds the env default only when no default exists', async () => {
    const seeder = new ModelDefaultSeeder(repository, config);
    await seeder.onApplicationBootstrap();
    const defaults = await prisma.model.findMany({
      where: { is_default: true },
    });
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.name).toBe('qwen2.5:1.5b');
  });
});
