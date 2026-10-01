import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminAnonymousDetail,
  AdminAnonymousListItem,
  Paginated,
  UsageRow,
} from '@js-rag-stack/contracts';
import { UsageReportingService } from '../../usage/usage-reporting.service';
import { toUsageTotals } from '../common/admin-query.helpers';
import { AdminAnonymousSessionsRepository } from './admin-anonymous-sessions.repository';
import type {
  GetAnonymousParams,
  GetAnonymousUsageParams,
  ListAnonymousParams,
} from './admin-anonymous-sessions.types';

@Injectable()
export class AdminAnonymousSessionsService {
  constructor(
    private readonly sessions: AdminAnonymousSessionsRepository,
    private readonly reporting: UsageReportingService,
  ) {}

  async list(
    params: ListAnonymousParams,
  ): Promise<Paginated<AdminAnonymousListItem>> {
    const { rows, total } = await this.sessions.listWithUsage(params);
    return {
      items: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        lastSeenAt: row.last_seen_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        chatCount: row.chat_count,
        usage: toUsageTotals(row),
      })),
      page: params.page.page,
      pageSize: params.page.pageSize,
      total,
    };
  }

  async get({ id, range }: GetAnonymousParams): Promise<AdminAnonymousDetail> {
    const session = await this.require(id);
    const owner = { type: 'anonymous' as const, id };
    const [usage, breakdown] = await Promise.all([
      this.reporting.getTotals({ owner, range }),
      this.reporting.getBreakdown({ owner, range }),
    ]);
    return {
      session: {
        id: session.id,
        createdAt: session.created_at.toISOString(),
        lastSeenAt: session.last_seen_at.toISOString(),
        expiresAt: session.expires_at.toISOString(),
        chatCount: session._count.chats,
      },
      usage,
      breakdown,
    };
  }

  async usage({
    id,
    range,
    page,
  }: GetAnonymousUsageParams): Promise<Paginated<UsageRow>> {
    await this.require(id);
    return this.reporting.listRows({
      owner: { type: 'anonymous', id },
      range,
      page,
    });
  }

  private async require(id: string) {
    const session = await this.sessions.findById(id);
    if (!session) throw new NotFoundException('Anonymous session not found.');
    return session;
  }
}
