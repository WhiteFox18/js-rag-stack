import { ModelsRepository } from '../src/models/models.repository';
import type { PrismaService } from '../src/prisma/prisma.service';

// Migrations don't seed a default model; tests establish their own.
export async function ensureDefaultModel(prisma: PrismaService): Promise<void> {
  if (await prisma.model.findFirst({ where: { is_default: true } })) return;
  await new ModelsRepository(prisma).seedDefault({
    name: 'qwen2.5:1.5b',
    maxContext: 8192,
  });
}
