import type { UsageTotals } from '@js-rag-stack/contracts';
import { formatDateTime, formatNumber } from '../lib/format';

export function UsageTotalsCards({ usage }: { usage: UsageTotals }) {
  const tiles = [
    { label: 'Requests', value: formatNumber(usage.requests) },
    { label: 'Input tokens', value: formatNumber(usage.inputTokens) },
    { label: 'Output tokens', value: formatNumber(usage.outputTokens) },
    { label: 'Last activity', value: formatDateTime(usage.lastActivityAt) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-border bg-surface p-4"
        >
          <dt className="text-xs text-fg-subtle">{tile.label}</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-fg">
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
