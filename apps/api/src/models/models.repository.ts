import { Injectable } from '@nestjs/common';
import type { Model } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateModelRecord,
  SeedDefaultModelParams,
  UpdateModelRecordParams,
} from './models.types';

@Injectable()
export class ModelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Model[]> {
    return this.prisma.model.findMany({ orderBy: { name: 'asc' } });
  }

  findByName(name: string): Promise<Model | null> {
    return this.prisma.model.findUnique({ where: { name } });
  }

  findById(id: string): Promise<Model | null> {
    return this.prisma.model.findUnique({ where: { id } });
  }

  findDefault(): Promise<Model | null> {
    return this.prisma.model.findFirst({ where: { is_default: true } });
  }

  create(data: CreateModelRecord): Promise<Model> {
    return this.prisma.model.create({ data });
  }

  update({ id, data }: UpdateModelRecordParams): Promise<Model> {
    return this.prisma.model.update({ where: { id }, data });
  }

  // Clear-then-set in one transaction; the partial unique index rejects a
  // concurrent second default, so the loser's transaction fails cleanly.
  setDefault(id: string): Promise<Model> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.model.updateMany({
        where: { is_default: true, NOT: { id } },
        data: { is_default: false },
      });
      return transaction.model.update({
        where: { id },
        data: { is_default: true, is_available: true },
      });
    });
  }

  async seedDefault({
    name,
    maxContext,
  }: SeedDefaultModelParams): Promise<Model> {
    const model = await this.prisma.model.upsert({
      where: { name },
      create: { name, max_context: maxContext },
      update: {},
    });
    return this.setDefault(model.id);
  }
}
