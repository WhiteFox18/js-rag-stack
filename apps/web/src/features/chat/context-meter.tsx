import type { ContextMeterProps } from './chat.types';

// Mirrors the API's default CHAT_CONTEXT_SUMMARIZE_AT_RATIO.
export const CONTEXT_WARN_RATIO = 0.75;

export function formatTokenCount(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

export function ContextMeter({ usedTokens, maxTokens }: ContextMeterProps) {
  if (maxTokens === null) return null;

  const ratio = usedTokens === null ? 0 : Math.min(1, usedTokens / maxTokens);
  const level = ratio >= CONTEXT_WARN_RATIO ? 'warn' : 'ok';
  const description =
    usedTokens === null
      ? `Context: no replies yet, ${maxTokens} token limit`
      : `Context: ${usedTokens} of ${maxTokens} tokens used`;
  const label = `${usedTokens === null ? '—' : formatTokenCount(usedTokens)} / ${formatTokenCount(maxTokens)} tokens`;

  return (
    <div
      title={description}
      data-level={level}
      className={`flex items-center gap-2 tabular-nums ${level === 'warn' ? 'text-warning' : ''}`}
    >
      <span className="sr-only">{description}</span>
      <span
        aria-hidden="true"
        className="h-1 w-12 overflow-hidden rounded-full bg-border"
      >
        <span
          className={`block h-full rounded-full ${level === 'warn' ? 'bg-warning' : 'bg-accent'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
      <span aria-hidden="true">{label}</span>
    </div>
  );
}
