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
      <p role="status" className="text-sm text-amber-300">
        No models available
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-slate-400">
        Model
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-cyan-400 disabled:opacity-60"
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
