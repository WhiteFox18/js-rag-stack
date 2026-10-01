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

  // For chat-scoped rows the chat is the source of truth for ownership: the
  // principal may have been transferred or deleted mid-stream. The principal's
  // columns are only the fallback when there is no chat (or it is gone).
  async create(data: CreateUsageRecord): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const chat = data.chat_id
        ? await transaction.chat.findUnique({
            where: { id: data.chat_id },
            select: { user_id: true, anonymous_session_id: true },
          })
        : null;
      await transaction.usageLog.create({
        data: chat
          ? {
              ...data,
              user_id: chat.user_id,
              anonymous_session_id: chat.anonymous_session_id,
            }
          : { ...data, chat_id: null },
        select: { id: true },
      });
    });
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
