import type { UsageBreakdownItem } from '@js-rag-stack/contracts';
import { formatNumber } from '../lib/format';

export function UsageBreakdownTable({
  items,
}: {
  items: UsageBreakdownItem[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Usage by model</caption>
        <thead>
          <tr className="text-xs text-fg-subtle">
            <th scope="col" className="py-2 pr-4 font-medium">
              Model
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Kind
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Requests
            </th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">
              Input
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Output
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr className="border-t border-border">
              <td colSpan={5} className="py-3 text-fg-muted">
                No usage yet.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={`${item.model}:${item.kind}`}
                className="border-t border-border"
              >
                <td className="py-2 pr-4">{item.model}</td>
                <td className="py-2 pr-4">{item.kind}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatNumber(item.requests)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatNumber(item.inputTokens)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatNumber(item.outputTokens)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
