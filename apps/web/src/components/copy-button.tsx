import { useEffect, useState } from 'react';
import type { CopyButtonProps } from './components.types';
import { CheckIcon, CopyIcon } from './icons';

type CopyState = 'idle' | 'copied' | 'failed';

const RESET_MS = 1500;

export function CopyButton({
  text,
  label = 'Copy',
  showLabel = false,
  className = '',
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), RESET_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  };

  const caption =
    state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label;

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg ${className}`}
    >
      {state === 'copied' ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      <span className={showLabel ? undefined : 'sr-only'}>{caption}</span>
    </button>
  );
}
