import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { usageAggregateSql } from '../common/admin-list.sql';
import { escapeLike } from '../common/admin-query.helpers';
import type { ListUsersParams, UserUsageRow } from './admin-users.types';

const SORTS = {
  lastActivity: Prisma.sql`s.last_activity_at DESC NULLS LAST, u.created_at DESC`,
  totalTokens: Prisma.sql`COALESCE(s.total_tokens, 0) DESC, u.created_at DESC`,
  createdAt: Prisma.sql`u.created_at DESC`,
} as const;

@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listWithUsage({ search, sort, range, page }: ListUsersParams) {
    const filter = this.searchSql(search);
    const [rows, counts] = await Promise.all([
      this.prisma.$queryRaw<UserUsageRow[]>`
        SELECT u.id, u.email, u.display_name, u.created_at,
               s.requests, s.input_tokens, s.output_tokens, s.last_activity_at
        FROM "user" u
        LEFT JOIN (${usageAggregateSql('user_id', range)}) s ON s.owner_id = u.id
        ${filter}
        ORDER BY ${SORTS[sort]}, u.id
        LIMIT ${page.pageSize} OFFSET ${(page.page - 1) * page.pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM "user" u ${filter}`,
    ]);
    return { rows, total: counts[0]?.total ?? 0 };
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  private searchSql(search: string | undefined): Prisma.Sql {
    const term = search?.trim();
    if (!term) return Prisma.empty;
    const pattern = `%${escapeLike(term)}%`;
    return Prisma.sql`WHERE u.email ILIKE ${pattern} OR u.display_name ILIKE ${pattern}`;
  }
}
