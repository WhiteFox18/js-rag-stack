import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { RangeFilter } from '../../components/range-filter';
import { UsageDetailBody } from '../../components/usage-detail';
import { api, toErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useListState } from '../../lib/use-list-state';

export function UserDetailPage() {
  const { userId = '' } = useParams();
  const list = useListState();
  const detail = useQuery({
    queryKey: ['users', userId, list.rangeQuery],
    queryFn: () => api.getUser(userId, list.rangeQuery),
    placeholderData: keepPreviousData,
  });
  const rows = useQuery({
    queryKey: ['users', userId, 'usage', list.page, list.rangeQuery],
    queryFn: () =>
      api.getUserUsage(userId, { page: list.page, ...list.rangeQuery }),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-4">
      <Link to="/users" className="text-sm text-accent hover:underline">
        ← Users
      </Link>
      {detail.isError && (
        <p role="alert" className="text-sm text-danger">
          {toErrorMessage(detail.error)}
        </p>
      )}
      {detail.data && (
        <>
          <header className="space-y-1">
            <h1 className="text-lg font-semibold">{detail.data.user.email}</h1>
            <p className="text-sm text-fg-muted">
              {detail.data.user.displayName ?? 'No name'} · joined{' '}
              {formatDateTime(detail.data.user.createdAt)}
            </p>
          </header>
          <RangeFilter value={list.range} onChange={list.setRange} />
          <UsageDetailBody
            usage={detail.data.usage}
            breakdown={detail.data.breakdown}
            rows={rows.data}
            rowsError={rows.isError ? rows.error : undefined}
            onPage={list.setPage}
          />
        </>
      )}
    </section>
  );
}
