import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createOpenApiDocument } from './common/swagger/openapi';

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  const document = createOpenApiDocument(app);
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  const outputPath = resolve(
    process.cwd(),
    '../../packages/api-client/openapi.json',
  );

  if (process.argv.includes('--check')) {
    const current = await readFile(outputPath, 'utf8').catch(() => '');
    if (current !== serialized) {
      throw new Error(
        'OpenAPI snapshot is stale. Run pnpm openapi:generate and commit the result.',
      );
    }
  } else {
    await writeFile(outputPath, serialized);
  }

  await app.close();
}

void generate();
