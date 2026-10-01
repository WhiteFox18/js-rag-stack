import { useId } from 'react';
import type { ModelSelectorProps } from './chat.types';

export function ModelSelector({
  models,
  value,
  unavailableModel,
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
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Model
      </label>
      <select
        id={id}
        value={unavailableModel ? '' : (value ?? '')}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-border bg-bg px-2 py-1 text-sm text-fg hover:bg-surface focus:border-accent disabled:opacity-60"
      >
        {unavailableModel && (
          <option value="" disabled>
            Choose a model
          </option>
        )}
        {models.map((model) => (
          <option key={model.name} value={model.name}>
            {model.name}
            {model.default ? ' (default)' : ''}
          </option>
        ))}
      </select>
      {unavailableModel && (
        <p
          role="alert"
          className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning"
        >
          {unavailableModel} is no longer available — choose another model
        </p>
      )}
    </div>
  );
}
