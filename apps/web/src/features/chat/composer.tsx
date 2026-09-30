import { useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { ComposerProps } from './chat.types';

const MAX_CHARS = 12_000;

function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeDraft({ key, value }: { key: string; value: string }): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Draft persistence is a convenience; ignore storage failures.
  }
}

export function Composer({
  draftKey,
  isBusy,
  disabled,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState(() => readDraft(draftKey));
  const [loadedKey, setLoadedKey] = useState(draftKey);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // A rejected send restores its text; if the draft key changes afterwards
  // (new chat navigation committing late), carry that text to the new key.
  const [restored, setRestored] = useState<string | null>(null);
  const trimmed = text.trim();

  if (loadedKey !== draftKey) {
    setRestored(null);
    setLoadedKey(draftKey);
    if (restored === null) {
      setText(readDraft(draftKey));
    } else {
      setText(restored);
      writeDraft({ key: draftKey, value: restored });
    }
  }

  const update = (value: string) => {
    setRestored(null);
    setText(value);
    writeDraft({ key: draftKey, value });
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!trimmed || isBusy || disabled) return;
    const content = trimmed;
    update('');
    const accepted = await onSend(content);
    if (!accepted) {
      update(content);
      setRestored(content);
    }
    textareaRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="sticky bottom-0 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <label htmlFor="composer-input" className="sr-only">
          Message
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          value={text}
          rows={2}
          maxLength={MAX_CHARS}
          disabled={disabled}
          placeholder="Send a message… (Enter to send, Shift+Enter for a new line)"
          onChange={(event) => update(event.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-48 min-h-12 flex-1 resize-y rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 disabled:opacity-60"
        />
        {isBusy ? (
          <button
            type="button"
            onClick={onStop}
            className="rounded-xl border border-rose-400/60 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/10"
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !trimmed}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </form>
  );
}
