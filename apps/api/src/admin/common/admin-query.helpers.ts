import { BadRequestException } from '@nestjs/common';
import type {
  PageQuery,
  UsageRangeQuery,
  UsageTotals,
} from '@js-rag-stack/contracts';
import { toSafeNumber } from '../../usage/usage.helpers';
import type { PageRequest, UsageRange } from '../../usage/usage.types';
import type { UsageAggregateColumns } from './admin-list.sql';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export function toPageRequest(query: PageQuery): PageRequest {
  return {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? DEFAULT_PAGE_SIZE,
  };
}

export function toUsageRange(query: UsageRangeQuery): UsageRange {
  const range: UsageRange = {};
  if (query.from) range.from = new Date(query.from);
  if (query.to) range.to = new Date(query.to);
  if (range.from && range.to && range.from >= range.to) {
    throw new BadRequestException('"from" must be before "to".');
  }
  return range;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function toUsageTotals(row: UsageAggregateColumns): UsageTotals {
  const inputTokens = toSafeNumber(row.input_tokens);
  const outputTokens = toSafeNumber(row.output_tokens);
  return {
    requests: row.requests ?? 0,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    lastActivityAt: row.last_activity_at?.toISOString() ?? null,
  };
}
