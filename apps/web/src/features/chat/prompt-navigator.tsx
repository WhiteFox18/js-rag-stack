import { useEffect, useRef } from 'react';
import type { PromptNavigatorProps } from './chat.types';

export function PromptNavigator({
  prompts,
  activeId,
  onSelect,
}: PromptNavigatorProps) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  return (
    <nav aria-label="Prompts in this chat" className="flex h-full flex-col">
      <h2 className="px-4 pt-4 pb-2 text-xs font-medium tracking-wide text-fg-subtle uppercase">
        Prompts
      </h2>
      <ol
        ref={listRef}
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-4"
      >
        {prompts.map((prompt, index) => {
          const active = prompt.id === activeId;
          return (
            <li key={prompt.id}>
              <button
                type="button"
                title={prompt.preview}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(prompt.id)}
                className={`relative block w-full truncate rounded-md py-1.5 pr-2 pl-3 text-left text-sm transition-colors ${
                  active
                    ? 'bg-accent-soft font-medium text-fg before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                <span className="sr-only">Prompt {index + 1}: </span>
                {prompt.preview}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
