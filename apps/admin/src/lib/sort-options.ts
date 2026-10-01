import type { AdminUserSort } from '@js-rag-stack/contracts';

export const SORT_OPTIONS: { value: AdminUserSort; label: string }[] = [
  { value: 'lastActivity', label: 'Last activity' },
  { value: 'totalTokens', label: 'Total tokens' },
  { value: 'createdAt', label: 'Newest' },
];
