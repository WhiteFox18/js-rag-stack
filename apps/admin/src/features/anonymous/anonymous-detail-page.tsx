import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { RangeFilter } from '../../components/range-filter';
import { UsageDetailBody } from '../../components/usage-detail';
import { api, toErrorMessage } from '../../lib/api';
import { formatDateTime, formatNumber, shortId } from '../../lib/format';
import { useListState } from '../../lib/use-list-state';

export function AnonymousDetailPage() {
  const { sessionId = '' } = useParams();
  const list = useListState();
  const detail = useQuery({
    queryKey: ['anonymous', sessionId, list.rangeQuery],
    queryFn: () => api.getAnonymousSession(sessionId, list.rangeQuery),
    placeholderData: keepPreviousData,
  });
  const rows = useQuery({
    queryKey: ['anonymous', sessionId, 'usage', list.page, list.rangeQuery],
    queryFn: () =>
      api.getAnonymousSessionUsage(sessionId, {
        page: list.page,
        ...list.rangeQuery,
      }),
    placeholderData: keepPreviousData,
  });

  const session = detail.data?.session;
  const facts = session
    ? [
        { label: 'Created', value: formatDateTime(session.createdAt) },
        { label: 'Last seen', value: formatDateTime(session.lastSeenAt) },
        { label: 'Expires', value: formatDateTime(session.expiresAt) },
        { label: 'Chats', value: formatNumber(session.chatCount) },
      ]
    : [];

  return (
    <section className="space-y-4">
      <Link to="/anonymous" className="text-sm text-accent hover:underline">
        ← Anonymous
      </Link>
      {detail.isError && (
        <p role="alert" className="text-sm text-danger">
          {toErrorMessage(detail.error)}
        </p>
      )}
      {detail.data && session && (
        <>
          <header className="space-y-2">
            <h1 className="text-lg font-semibold">
              Session {shortId(session.id)}
            </h1>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {facts.map((fact) => (
                <div key={fact.label} className="flex gap-2">
                  <dt className="text-fg-subtle">{fact.label}</dt>
                  <dd className="text-fg-muted">{fact.value}</dd>
                </div>
              ))}
            </dl>
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
