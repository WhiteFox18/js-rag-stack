import { Injectable } from '@nestjs/common';
import type { Model } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ModelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Model[]> {
    return this.prisma.model.findMany({ orderBy: { name: 'asc' } });
  }

  findByName(name: string): Promise<Model | null> {
    return this.prisma.model.findUnique({ where: { name } });
  }
}
