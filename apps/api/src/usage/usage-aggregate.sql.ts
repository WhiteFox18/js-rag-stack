import { Prisma } from '../generated/prisma/client';
import type { UsageExistsParams, UsageRange } from './usage.types';

// Admin list repositories join this fragment because sorting/paging across all
// owners by aggregated usage can't go through per-owner service calls.
export function usageRangeSql(range: UsageRange): Prisma.Sql {
  return Prisma.sql`${range.from ? Prisma.sql` AND created_at >= ${range.from}` : Prisma.empty}${
    range.to ? Prisma.sql` AND created_at < ${range.to}` : Prisma.empty
  }`;
}

// Correlated EXISTS for admin list filters; keeps usage_log SQL in this module.
export function usageExistsSql({
  ownerColumn,
  alias,
}: UsageExistsParams): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM "usage_log" l WHERE l.${Prisma.raw(`"${ownerColumn}"`)} = ${Prisma.raw(alias)}.id)`;
}

export function usageAggregateSql(
  ownerColumn: 'user_id' | 'anonymous_session_id',
  range: UsageRange,
): Prisma.Sql {
  const column = Prisma.raw(`"${ownerColumn}"`);
  return Prisma.sql`
    SELECT ${column} AS owner_id,
           COUNT(*)::int AS requests,
           SUM(input_tokens)::bigint AS input_tokens,
           SUM(output_tokens)::bigint AS output_tokens,
           SUM(input_tokens + output_tokens)::bigint AS total_tokens,
           MAX(created_at) AS last_activity_at
    FROM "usage_log"
    WHERE ${column} IS NOT NULL ${usageRangeSql(range)}
    GROUP BY ${column}`;
}

export interface UsageAggregateColumns {
  requests: number | null;
  input_tokens: bigint | null;
  output_tokens: bigint | null;
  last_activity_at: Date | null;
}
