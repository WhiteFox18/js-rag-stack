import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { usageAggregateSql } from '../../usage/usage-aggregate.sql';
import type {
  AnonymousUsageRow,
  ListAnonymousParams,
} from './admin-anonymous-sessions.types';

const SORTS = {
  lastActivity: Prisma.sql`s.last_activity_at DESC NULLS LAST, a.last_seen_at DESC`,
  totalTokens: Prisma.sql`COALESCE(s.total_tokens, 0) DESC, a.last_seen_at DESC`,
  createdAt: Prisma.sql`a.created_at DESC`,
} as const;

// Hide visitor sessions that never chatted nor used a model.
const HAS_ACTIVITY = Prisma.sql`
  WHERE EXISTS (SELECT 1 FROM "usage_log" l WHERE l.anonymous_session_id = a.id)
     OR EXISTS (SELECT 1 FROM "chat" c WHERE c.anonymous_session_id = a.id)`;

@Injectable()
export class AdminAnonymousSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listWithUsage({ sort, range, page }: ListAnonymousParams) {
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<AnonymousUsageRow[]>`
        SELECT a.id, a.created_at, a.last_seen_at, a.expires_at,
               (SELECT COUNT(*)::int FROM "chat" c WHERE c.anonymous_session_id = a.id) AS chat_count,
               s.requests, s.input_tokens, s.output_tokens, s.last_activity_at
        FROM "anonymous_session" a
        LEFT JOIN (${usageAggregateSql('anonymous_session_id', range)}) s ON s.owner_id = a.id
        ${HAS_ACTIVITY}
        ORDER BY ${SORTS[sort]}, a.id
        LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM "anonymous_session" a ${HAS_ACTIVITY}`,
    ]);
    return { rows, total: counts[0]?.total ?? 0 };
  }

  findById(id: string) {
    return this.prisma.anonymousSession.findUnique({
      where: { id },
      include: { _count: { select: { chats: true } } },
    });
  }
}
