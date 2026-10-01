import { Prisma } from '../../generated/prisma/client';
import type { UsageRange } from '../../usage/usage.types';

export function usageRangeSql(range: UsageRange): Prisma.Sql {
  return Prisma.sql`${range.from ? Prisma.sql` AND created_at >= ${range.from}` : Prisma.empty}${
    range.to ? Prisma.sql` AND created_at < ${range.to}` : Prisma.empty
  }`;
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
