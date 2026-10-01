import { useMutation } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import type { CreateModelInput } from '@js-rag-stack/contracts';
import { api, toErrorMessage } from '../../lib/api';

export function AddModelForm({ onCreated }: { onCreated: () => void }) {
  const nameId = useId();
  const contextId = useId();
  const [name, setName] = useState('');
  const [maxContext, setMaxContext] = useState('8192');
  const create = useMutation({
    mutationFn: (input: CreateModelInput) => api.createModel(input),
    onSuccess: () => {
      setName('');
      setMaxContext('8192');
      onCreated();
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ name: name.trim(), maxContext: Number(maxContext) });
  };

  const input = 'rounded-lg border border-border bg-bg px-3 py-1.5 text-sm';
  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-sm font-semibold">Add model</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={nameId} className="text-xs text-fg-muted">
            Model name
          </label>
          <input
            id={nameId}
            required
            maxLength={200}
            placeholder="llama3.2:3b"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={input}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={contextId} className="text-xs text-fg-muted">
            Max context
          </label>
          <input
            id={contextId}
            type="number"
            required
            min={512}
            max={1_048_576}
            step={512}
            value={maxContext}
            onChange={(event) => setMaxContext(event.target.value)}
            className={`${input} w-32`}
          />
        </div>
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          Add model
        </button>
      </div>
      {create.isError && (
        <p role="alert" className="text-sm text-danger">
          {toErrorMessage(create.error)}
        </p>
      )}
    </form>
  );
}
