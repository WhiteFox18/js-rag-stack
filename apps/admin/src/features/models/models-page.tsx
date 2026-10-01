import type { UpdateModelInput } from '@js-rag-stack/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, toErrorMessage } from '../../lib/api';
import { AddModelForm } from './add-model-form';
import { ModelRow } from './model-row';

const MODELS_KEY = ['models'] as const;

export function ModelsPage() {
  const queryClient = useQueryClient();
  const models = useQuery({
    queryKey: MODELS_KEY,
    queryFn: () => api.listModels(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: MODELS_KEY });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateModelInput }) =>
      api.updateModel(id, input),
    onSettled: refresh,
  });
  const error = models.error ?? update.error;

  return (
    <section className="space-y-4">
      <h1 className="text-lg font-semibold">Models</h1>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {toErrorMessage(error)}
        </p>
      )}
      {models.data && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Models</caption>
            <thead className="bg-surface text-xs text-fg-subtle">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Max context</th>
                <th className="px-3 py-2">Ollama</th>
                <th className="px-3 py-2">Available</th>
                <th className="px-3 py-2">Default</th>
              </tr>
            </thead>
            <tbody>
              {models.data?.models.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  busy={update.isPending}
                  onUpdate={({ input, onError }) =>
                    update.mutate({ id: model.id, input }, { onError })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AddModelForm onCreated={() => void refresh()} />
    </section>
  );
}
