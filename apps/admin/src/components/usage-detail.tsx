import type {
  Paginated,
  UsageBreakdownItem,
  UsageRow,
  UsageTotals,
} from '@js-rag-stack/contracts';
import { toErrorMessage } from '../lib/api';
import { Pagination } from './pagination';
import { UsageBreakdownTable } from './usage-breakdown-table';
import { UsageLogTable } from './usage-log-table';
import { UsageTotalsCards } from './usage-totals';

export function UsageDetailBody({
  usage,
  breakdown,
  rows,
  rowsError,
  onPage,
}: {
  usage: UsageTotals;
  breakdown: UsageBreakdownItem[];
  rows: Paginated<UsageRow> | undefined;
  rowsError?: unknown;
  onPage: (page: number) => void;
}) {
  return (
    <div className="space-y-6">
      <UsageTotalsCards usage={usage} />
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">By model</h2>
        <UsageBreakdownTable items={breakdown} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Usage log</h2>
        {rows ? (
          <>
            <UsageLogTable rows={rows.items} />
            <Pagination
              page={rows.page}
              pageSize={rows.pageSize}
              total={rows.total}
              onPage={onPage}
            />
          </>
        ) : rowsError ? (
          <p role="alert" className="text-sm text-danger">
            {toErrorMessage(rowsError)}
          </p>
        ) : (
          <p className="text-sm text-fg-muted">Loading…</p>
        )}
      </section>
    </div>
  );
}
