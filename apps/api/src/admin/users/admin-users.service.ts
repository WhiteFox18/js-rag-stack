import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AdminUserDetail,
  AdminUserListItem,
  Paginated,
  UsageRow,
} from '@js-rag-stack/contracts';
import type { User } from '../../generated/prisma/client';
import { UsageReportingService } from '../../usage/usage-reporting.service';
import { toUsageTotals } from '../common/admin-query.helpers';
import { AdminUsersRepository } from './admin-users.repository';
import type {
  GetUserParams,
  GetUserUsageParams,
  ListUsersParams,
} from './admin-users.types';

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly users: AdminUsersRepository,
    private readonly reporting: UsageReportingService,
  ) {}

  async list(params: ListUsersParams): Promise<Paginated<AdminUserListItem>> {
    const { rows, total } = await this.users.listWithUsage(params);
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        createdAt: row.created_at.toISOString(),
        usage: toUsageTotals(row),
      })),
      page: params.page.page,
      pageSize: params.page.pageSize,
      total,
    };
  }

  async get({ id, range }: GetUserParams): Promise<AdminUserDetail> {
    const user = await this.require(id);
    const owner = { type: 'user' as const, id };
    const [usage, breakdown] = await Promise.all([
      this.reporting.getTotals({ owner, range }),
      this.reporting.getBreakdown({ owner, range }),
    ]);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        createdAt: user.created_at.toISOString(),
      },
      usage,
      breakdown,
    };
  }

  async usage({
    id,
    range,
    page,
  }: GetUserUsageParams): Promise<Paginated<UsageRow>> {
    await this.require(id);
    return this.reporting.listRows({
      owner: { type: 'user', id },
      range,
      page,
    });
  }

  private async require(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }
}
