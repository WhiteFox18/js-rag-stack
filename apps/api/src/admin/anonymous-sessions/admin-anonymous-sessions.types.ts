import type { AdminUserSort } from '@js-rag-stack/contracts';
import type { PageRequest, UsageRange } from '../../usage/usage.types';
import type { UsageAggregateColumns } from '../common/admin-list.sql';

export interface ListAnonymousParams {
  sort: AdminUserSort;
  range: UsageRange;
  page: PageRequest;
}

export interface AnonymousUsageRow extends UsageAggregateColumns {
  id: string;
  created_at: Date;
  last_seen_at: Date;
  expires_at: Date;
  chat_count: number;
}

export interface GetAnonymousParams {
  id: string;
  range: UsageRange;
}

export interface GetAnonymousUsageParams extends GetAnonymousParams {
  page: PageRequest;
}
