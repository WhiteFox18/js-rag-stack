import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateUsageRecord,
  FindUsageRowsParams,
  ReassignAnonymousUsageParams,
} from './usage.types';

@Injectable()
export class UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUsageRecord): Promise<void> {
    await this.prisma.usageLog.create({ data, select: { id: true } });
  }

  async reassignAnonymous({
    transaction,
    anonymousSessionId,
    userId,
  }: ReassignAnonymousUsageParams): Promise<void> {
    await transaction.usageLog.updateMany({
      where: { anonymous_session_id: anonymousSessionId },
      data: { anonymous_session_id: null, user_id: userId },
    });
  }

  aggregate(where: Prisma.UsageLogWhereInput) {
    return this.prisma.usageLog.aggregate({
      where,
      _count: { _all: true },
      _sum: { input_tokens: true, output_tokens: true },
      _max: { created_at: true },
    });
  }

  async breakdown(where: Prisma.UsageLogWhereInput) {
    const groups = await this.prisma.usageLog.groupBy({
      by: ['model_id', 'kind'],
      where,
      _count: { _all: true },
      _sum: { input_tokens: true, output_tokens: true },
      orderBy: [{ model_id: 'asc' }, { kind: 'asc' }],
    });
    const models = await this.prisma.model.findMany({
      where: { id: { in: groups.map((group) => group.model_id) } },
      select: { id: true, name: true },
    });
    return { groups, modelNames: new Map(models.map((m) => [m.id, m.name])) };
  }

  findRows({ where, skip, take }: FindUsageRowsParams) {
    return this.prisma.$transaction([
      this.prisma.usageLog.findMany({
        where,
        include: { model: { select: { name: true } } },
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      this.prisma.usageLog.count({ where }),
    ]);
  }
}
