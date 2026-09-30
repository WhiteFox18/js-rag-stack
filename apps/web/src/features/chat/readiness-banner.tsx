import type { ReadinessBannerProps } from './chat.types';

const LABELS = {
  database: 'database',
  redis: 'cache',
  ollama: 'model service',
} as const;

export function ReadinessBanner({ readiness }: ReadinessBannerProps) {
  if (readiness.status === 'ready') return null;

  const down = (Object.keys(LABELS) as (keyof typeof LABELS)[])
    .filter((key) => readiness.checks[key] === 'down')
    .map((key) => LABELS[key]);

  return (
    <div
      role="status"
      className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-200"
    >
      Service degraded
      {down.length > 0 ? `: ${down.join(', ')} unavailable.` : '.'} Some
      features may not work until it recovers.
    </div>
  );
}
