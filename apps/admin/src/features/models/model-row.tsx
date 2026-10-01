import type { AdminModel, UpdateModelInput } from '@js-rag-stack/contracts';
import { useRef, useState, type FormEvent } from 'react';
import { formatNumber } from '../../lib/format';

const MIN_CONTEXT = 512;
const MAX_CONTEXT = 1_048_576;

export function ModelRow({
  model,
  busy,
  onUpdate,
}: {
  model: AdminModel;
  busy: boolean;
  onUpdate: (params: { input: UpdateModelInput; onError?: () => void }) => void;
}) {
  const [context, setContext] = useState(String(model.maxContext));
  const lastSubmitted = useRef<number | null>(null);
  const resetContext = () => {
    lastSubmitted.current = null;
    setContext(String(model.maxContext));
  };

  // Follow the server value after a refetch (adjust state during render).
  const [seenMaxContext, setSeenMaxContext] = useState(model.maxContext);
  if (seenMaxContext !== model.maxContext) {
    setSeenMaxContext(model.maxContext);
    setContext(String(model.maxContext));
  }
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
      context.trim() === '' ||
      !Number.isInteger(value) ||
      value < MIN_CONTEXT ||
      value > MAX_CONTEXT
    ) {
      resetContext();
      return;
    }
    if (value !== model.maxContext && value !== lastSubmitted.current) {
      lastSubmitted.current = value;
      onUpdate({ input: { maxContext: value }, onError: resetContext });
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
            min={MIN_CONTEXT}
            max={MAX_CONTEXT}
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
          onChange={(event) =>
            onUpdate({ input: { isAvailable: event.target.checked } })
          }
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
            onClick={() => onUpdate({ input: { isDefault: true } })}
            className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-50"
          >
            Make default
          </button>
        )}
      </td>
    </tr>
  );
}
