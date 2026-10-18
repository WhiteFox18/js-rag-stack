import type { UsageRow } from '@js-rag-stack/contracts';
import { Link } from 'react-router-dom';
import {
  formatDateTime,
  formatNumber,
  formatUsageKind,
  shortId,
} from '../lib/format';

export function UsageLogTable({ rows }: { rows: UsageRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Usage log</caption>
        <thead>
          <tr className="text-xs text-fg-subtle">
            <th scope="col" className="py-2 pr-4 font-medium">
              Chat
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Date
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Model
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Kind
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
          {rows.length === 0 ? (
            <tr className="border-t border-border">
              <td colSpan={6} className="py-3 text-fg-muted">
                No usage yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-2 pr-4">
                  {row.chatId ? (
                    <Link
                      to={`/chats/${row.chatId}`}
                      aria-label={`Open chat ${shortId(row.chatId)}`}
                      className="text-accent hover:underline font-mono text-xs"
                    >
                      {shortId(row.chatId)}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">{formatDateTime(row.createdAt)}</td>
                <td className="py-2 pr-4">{row.model}</td>
                <td className="py-2 pr-4">{formatUsageKind(row.kind)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {formatNumber(row.inputTokens)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatNumber(row.outputTokens)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
