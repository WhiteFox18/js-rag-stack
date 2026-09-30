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
      className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm text-warning"
    >
      Service degraded
      {down.length > 0 ? `: ${down.join(', ')} unavailable.` : '.'} Some
      features may not work until it recovers.
    </div>
  );
}
