import type { AdminUserSort } from '@js-rag-stack/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../components/pagination';
import { RangeFilter } from '../../components/range-filter';
import { api, toErrorMessage } from '../../lib/api';
import { formatDateTime, formatNumber, shortId } from '../../lib/format';
import { SORT_OPTIONS } from '../../lib/sort-options';
import { useListState } from '../../lib/use-list-state';

export function AnonymousPage() {
  const list = useListState();
  const sortId = useId();
  const sort = (list.param('sort') || 'lastActivity') as AdminUserSort;
  const query = { page: list.page, sort, ...list.rangeQuery };
  const sessions = useQuery({
    queryKey: ['anonymous', query],
    queryFn: () => api.listAnonymousSessions(query),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">Anonymous</h1>
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={sortId} className="text-sm text-fg-muted">
          Sort by
        </label>
        <select
          id={sortId}
          value={sort}
          onChange={(event) => list.setParam('sort', event.target.value)}
          className="rounded-lg border border-border bg-bg px-2 py-1 text-sm"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <RangeFilter value={list.range} onChange={list.setRange} />
      </div>
      {sessions.isError && (
        <p role="alert" className="text-sm text-danger">
          {toErrorMessage(sessions.error)}
        </p>
      )}
      {sessions.data ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Anonymous sessions</caption>
            <thead className="bg-surface text-xs text-fg-subtle">
              <tr>
                <th className="px-3 py-2">Session</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Last seen</th>
                <th className="px-3 py-2 text-right">Chats</th>
                <th className="px-3 py-2 text-right">Requests</th>
                <th className="px-3 py-2 text-right">Input</th>
                <th className="px-3 py-2 text-right">Output</th>
                <th className="px-3 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data?.items.map((session) => (
                <tr
                  key={session.id}
                  className="border-t border-border hover:bg-surface"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link
                      to={`/anonymous/${session.id}`}
                      className="text-accent hover:underline"
                    >
                      {shortId(session.id)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {formatDateTime(session.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {formatDateTime(session.lastSeenAt)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(session.chatCount)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(session.usage.requests)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(session.usage.inputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(session.usage.outputTokens)}
                  </td>
                  <td className="px-3 py-2">
                    {formatDateTime(session.usage.lastActivityAt)}
                  </td>
                </tr>
              ))}
              {sessions.data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-fg-subtle"
                  >
                    No anonymous sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        !sessions.isError && <p className="text-sm text-fg-muted">Loading…</p>
      )}
      {sessions.data && (
        <Pagination
          page={sessions.data.page}
          pageSize={sessions.data.pageSize}
          total={sessions.data.total}
          onPage={list.setPage}
        />
      )}
    </section>
  );
}
