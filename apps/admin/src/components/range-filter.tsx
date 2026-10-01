import { useId } from 'react';

export interface DateRangeValue {
  from: string;
  to: string;
}

export function RangeFilter({
  value,
  onChange,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
}) {
  const fromId = useId();
  const toId = useId();
  const input =
    'rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg';
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor={fromId} className="text-fg-muted">
        From
      </label>
      <input
        id={fromId}
        type="date"
        className={input}
        value={value.from}
        max={value.to || undefined}
        onChange={(event) => onChange({ ...value, from: event.target.value })}
      />
      <label htmlFor={toId} className="text-fg-muted">
        To
      </label>
      <input
        id={toId}
        type="date"
        className={input}
        value={value.to}
        min={value.from || undefined}
        onChange={(event) => onChange({ ...value, to: event.target.value })}
      />
    </div>
  );
}
