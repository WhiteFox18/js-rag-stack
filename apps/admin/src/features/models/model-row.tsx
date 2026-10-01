import type { AdminModel, UpdateModelInput } from '@js-rag-stack/contracts';
import { useRef, useState, type FormEvent } from 'react';
import { formatNumber } from '../../lib/format';

export function ModelRow({
  model,
  busy,
  onUpdate,
}: {
  model: AdminModel;
  busy: boolean;
  onUpdate: (input: UpdateModelInput) => void;
}) {
  const [context, setContext] = useState(String(model.maxContext));
  const lastSubmitted = useRef<number | null>(null);
  const installed =
    model.installed === null
      ? 'Unknown'
      : model.installed
        ? 'Installed'
        : 'Not installed';

  const saveContext = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(context);
    if (
      Number.isInteger(value) &&
      value !== model.maxContext &&
      value !== lastSubmitted.current
    ) {
      lastSubmitted.current = value;
      onUpdate({ maxContext: value });
    }
  };

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium">{model.name}</td>
      <td className="px-3 py-2">
        <form onSubmit={saveContext} className="flex items-center gap-2">
          <input
            type="number"
            title="Max context"
            min={512}
            max={1_048_576}
            step={512}
            value={context}
            onChange={(event) => {
              lastSubmitted.current = null;
              setContext(event.target.value);
            }}
            onBlur={saveContext}
            className="w-28 rounded-lg border border-border bg-bg px-2 py-1 tabular-nums"
          />
          <span className="sr-only">
            {formatNumber(model.maxContext)} tokens
          </span>
        </form>
      </td>
      <td className="px-3 py-2 text-fg-muted">{installed}</td>
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label="Available"
          checked={model.isAvailable}
          disabled={busy || model.isDefault}
          title={
            model.isDefault
              ? 'The default model cannot be made unavailable.'
              : undefined
          }
          onChange={(event) => onUpdate({ isAvailable: event.target.checked })}
        />
      </td>
      <td className="px-3 py-2">
        {model.isDefault ? (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
            Default
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onUpdate({ isDefault: true })}
            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-50"
          >
            Make default
          </button>
        )}
      </td>
    </tr>
  );
}
