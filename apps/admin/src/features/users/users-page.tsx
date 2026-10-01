import type { AdminUserSort } from '@js-rag-stack/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../components/pagination';
import { RangeFilter } from '../../components/range-filter';
import { api, toErrorMessage } from '../../lib/api';
import { formatDateTime, formatNumber } from '../../lib/format';
import { SORT_OPTIONS } from '../../lib/sort-options';
import { useDebouncedValue } from '../../lib/use-debounced-value';
import { useListState } from '../../lib/use-list-state';

const SEARCH_DEBOUNCE_MS = 300;

export function UsersPage() {
  const list = useListState();
  const sortId = useId();
  const search = list.param('search');
  const [searchText, setSearchText] = useState(search);
  const committedSearch = useDebouncedValue({
    value: searchText,
    delayMs: SEARCH_DEBOUNCE_MS,
  });
  const { setParam } = list;
  // The search value the URL is known to hold (pushed by us or seen from outside).
  const knownUrlSearch = useRef(search);
  useEffect(() => {
    if (search !== knownUrlSearch.current) {
      // External navigation changed the param: the URL wins over local input.
      knownUrlSearch.current = search;
      setSearchText(search);
    }
  }, [search]);
  useEffect(() => {
    if (committedSearch !== knownUrlSearch.current) {
      knownUrlSearch.current = committedSearch;
      setParam('search', committedSearch);
    }
  }, [committedSearch, setParam]);
  const sort = (list.param('sort') || 'lastActivity') as AdminUserSort;
  const query = {
    page: list.page,
    sort,
    search: search || undefined,
    ...list.rangeQuery,
  };
  const users = useQuery({
    queryKey: ['users', query],
    queryFn: () => api.listUsers(query),
    placeholderData: keepPreviousData,
  });

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">Users</h1>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search users"
          placeholder="Search email or name"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          className="w-full max-w-xs rounded-lg border border-border bg-bg px-3 py-1.5 text-sm"
        />
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
      {users.isError && (
        <p role="alert" className="text-sm text-danger">
          {toErrorMessage(users.error)}
        </p>
      )}
      {users.data ? (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Users</caption>
            <thead className="bg-surface text-xs text-fg-subtle">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2 text-right">Requests</th>
                <th className="px-3 py-2 text-right">Input</th>
                <th className="px-3 py-2 text-right">Output</th>
                <th className="px-3 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.items.map((user) => (
                <tr
                  key={user.id}
                  className="border-t border-border hover:bg-surface"
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/users/${user.id}`}
                      className="text-accent hover:underline"
                    >
                      {user.email}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{user.displayName ?? '—'}</td>
                  <td className="px-3 py-2">
                    {formatDateTime(user.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(user.usage.requests)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(user.usage.inputTokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatNumber(user.usage.outputTokens)}
                  </td>
                  <td className="px-3 py-2">
                    {formatDateTime(user.usage.lastActivityAt)}
                  </td>
                </tr>
              ))}
              {users.data?.items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-fg-subtle"
                  >
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        !users.isError && <p className="text-sm text-fg-muted">Loading…</p>
      )}
      {users.data && (
        <Pagination
          page={users.data.page}
          pageSize={users.data.pageSize}
          total={users.data.total}
          onPage={list.setPage}
        />
      )}
    </section>
  );
}
