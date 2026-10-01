import { randomBytes } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { ModelAdministrationService } from '../src/models/model-administration.service';
import { ModelCatalogService } from '../src/models/model-catalog.service';
import { ModelDefaultSeeder } from '../src/models/model-default.seeder';
import { ModelsRepository } from '../src/models/models.repository';
import { OllamaError } from '../src/ollama/ollama.errors';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureDefaultModel } from './models.test-helpers';

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
    await ensureDefaultModel(prisma);
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

  describe('administration', () => {
    function admin(installedNames: string[] | Error = ['qwen2.5:1.5b']) {
      return new ModelAdministrationService(repository, {
        listInstalledModels: () =>
          installedNames instanceof Error
            ? Promise.reject(installedNames)
            : Promise.resolve(installedNames),
      } as never);
    }

    async function restoreQwenDefault() {
      const qwen = await prisma.model.findUniqueOrThrow({
        where: { name: 'qwen2.5:1.5b' },
      });
      await repository.setDefault(qwen.id);
    }

    afterEach(restoreQwenDefault);

    it('creates a model, trimming the name, and rejects duplicates', async () => {
      const name = `  test-${randomBytes(4).toString('hex')}  `;
      const model = await admin().create({ name, maxContext: 2048 });
      created.push(model.id);
      expect(model).toMatchObject({
        name: name.trim(),
        maxContext: 2048,
        isAvailable: true,
        isDefault: false,
        installed: false,
      });
      await expect(
        admin().create({ name: name.trim(), maxContext: 2048 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('reports installed as null when Ollama is down', async () => {
      const models = await admin(new Error('down')).listAll();
      expect(models.every((m) => m.installed === null)).toBe(true);
    });

    it('switches the default atomically', async () => {
      const next = await createModel();
      const updated = await admin().update({
        id: next.id,
        input: { isDefault: true },
      });
      expect(updated.isDefault).toBe(true);
      expect(await prisma.model.count({ where: { is_default: true } })).toBe(1);
    });

    it('refuses to unset or disable the default', async () => {
      const qwen = await prisma.model.findUniqueOrThrow({
        where: { name: 'qwen2.5:1.5b' },
      });
      await expect(
        admin().update({ id: qwen.id, input: { isDefault: false } }),
      ).rejects.toThrow('Choose another default model first.');
      await expect(
        admin().update({ id: qwen.id, input: { isAvailable: false } }),
      ).rejects.toThrow('The default model cannot be made unavailable.');
      const after = await prisma.model.findUniqueOrThrow({
        where: { id: qwen.id },
      });
      expect(after).toMatchObject({ is_default: true, is_available: true });
    });

    it('requires availability before making a disabled model default', async () => {
      const disabled = await createModel({ is_available: false });
      await expect(
        admin().update({ id: disabled.id, input: { isDefault: true } }),
      ).rejects.toBeInstanceOf(ConflictException);
      const ok = await admin().update({
        id: disabled.id,
        input: { isDefault: true, isAvailable: true },
      });
      expect(ok).toMatchObject({ isDefault: true, isAvailable: true });
    });

    it('edits max context and availability; 404 for unknown ids', async () => {
      const model = await createModel();
      const updated = await admin().update({
        id: model.id,
        input: { maxContext: 16384, isAvailable: false },
      });
      expect(updated).toMatchObject({ maxContext: 16384, isAvailable: false });
      await expect(
        admin().update({
          id: '00000000-0000-7000-8000-000000000000',
          input: { maxContext: 1024 },
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
