import type { AdminUserSort } from '@js-rag-stack/contracts';
import type { PageRequest, UsageRange } from '../../usage/usage.types';
import type { UsageAggregateColumns } from '../common/admin-list.sql';

export interface ListUsersParams {
  search?: string;
  sort: AdminUserSort;
  range: UsageRange;
  page: PageRequest;
}

export interface UserUsageRow extends UsageAggregateColumns {
  id: string;
  email: string;
  display_name: string | null;
  created_at: Date;
}

export interface GetUserParams {
  id: string;
  range: UsageRange;
}

export interface GetUserUsageParams extends GetUserParams {
  page: PageRequest;
}
