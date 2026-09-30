import { useId } from 'react';
import type { ModelSelectorProps } from './chat.types';

export function ModelSelector({
  models,
  value,
  disabled,
  onChange,
}: ModelSelectorProps) {
  const id = useId();

  if (models.length === 0) {
    return (
      <p
        role="status"
        className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning"
      >
        No models available
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Model
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg hover:bg-surface focus:border-accent disabled:opacity-60"
      >
        {models.map((model) => (
          <option key={model.name} value={model.name}>
            {model.name}
            {model.default ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
