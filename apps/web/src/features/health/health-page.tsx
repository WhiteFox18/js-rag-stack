import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@js-rag-stack/contracts';

async function getHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health', {
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Health request failed with status ${response.status}.`);
  }

  return response.json() as Promise<HealthResponse>;
}

export function HealthPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    refetchInterval: 30_000,
  });

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="space-y-4">
          <p className="text-sm font-semibold tracking-[0.22em] text-cyan-400 uppercase">
            Local LLM Chat
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            The workspace is ready.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">
            React and NestJS are running together through Turborepo. This page
            checks the API directly and will become the chat shell in Phase 5.
          </p>
        </header>

        <div
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-cyan-950/20"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium">API health</h2>
              <p className="mt-1 text-sm text-slate-400">GET /api/v1/health</p>
            </div>
            <HealthBadge
              isPending={health.isPending}
              isError={health.isError}
            />
          </div>

          {health.data ? (
            <dl className="mt-6 grid gap-4 border-t border-slate-800 pt-6 sm:grid-cols-2">
              <HealthDetail label="Service" value={health.data.service} />
              <HealthDetail
                label="Uptime"
                value={`${health.data.uptimeSeconds}s`}
              />
              <HealthDetail
                label="Checked"
                value={new Date(health.data.timestamp).toLocaleString()}
              />
              <HealthDetail label="Status" value={health.data.status} />
            </dl>
          ) : null}

          {health.isError ? (
            <p className="mt-6 border-t border-slate-800 pt-6 text-sm text-rose-300">
              The API is unavailable. Confirm that both workspace development
              tasks are running.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

interface HealthBadgeProps {
  isPending: boolean;
  isError: boolean;
}

function HealthBadge({ isPending, isError }: HealthBadgeProps) {
  const label = isPending ? 'Checking' : isError ? 'Unavailable' : 'Healthy';
  const color = isPending
    ? 'bg-amber-400'
    : isError
      ? 'bg-rose-400'
      : 'bg-emerald-400';

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1.5 text-sm">
      <span className={`size-2 rounded-full ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

interface HealthDetailProps {
  label: string;
  value: string;
}

function HealthDetail({ label, value }: HealthDetailProps) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wider text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-mono text-sm text-slate-200">{value}</dd>
    </div>
  );
}
