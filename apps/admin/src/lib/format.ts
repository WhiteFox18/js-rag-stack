import type { UsageKind } from '@js-rag-stack/contracts';

const numberFormat = new Intl.NumberFormat('en-US');
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

export function formatDateTime(iso: string | null): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—';
}

export function formatUsageKind(kind: UsageKind): string {
  return kind === 'admin_summary' ? 'admin summary' : kind;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

// Date inputs are the admin's local calendar days, so bounds are local midnight.
function localMidnight({
  date,
  dayOffset,
}: {
  date: string;
  dayOffset: number;
}) {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(year, month - 1, day + dayOffset);
}

export function toIsoStart(date: string): string | undefined {
  return date ? localMidnight({ date, dayOffset: 0 }).toISOString() : undefined;
}

export function toIsoEndExclusive(date: string): string | undefined {
  return date ? localMidnight({ date, dayOffset: 1 }).toISOString() : undefined;
}
