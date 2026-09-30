import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { SendIcon, StopIcon } from '../../components/icons';
import type { ComposerProps } from './chat.types';

const MAX_CHARS = 12_000;
const COUNTER_THRESHOLD = MAX_CHARS * 0.9;

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
  insertion = null,
  contextMeter = null,
  onSend,
  onStop,
}: ComposerProps) {
  const [text, setText] = useState(() => readDraft(draftKey));
  const [loadedKey, setLoadedKey] = useState(draftKey);
  const [appliedInsertionId, setAppliedInsertionId] = useState<number | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  // A rejected send restores its text; if the draft key changes afterwards
  // (new chat navigation committing late), carry that text to the new key.
  const [restored, setRestored] = useState<string | null>(null);
  const trimmed = text.trim();
  const insertionId = insertion?.id ?? null;

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

  if (insertion && insertion.id !== appliedInsertionId) {
    setAppliedInsertionId(insertion.id);
    setRestored(null);
    setText(insertion.text);
    writeDraft({ key: draftKey, value: insertion.text });
  }

  useEffect(() => {
    if (insertionId !== null) textareaRef.current?.focus();
  }, [insertionId]);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    if (textarea.scrollHeight > 0) {
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [text]);

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
      className="shrink-0 px-4 pt-2 pb-3"
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface py-2 pr-2 pl-4 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          <label htmlFor="composer-input" className="sr-only">
            Message
          </label>
          <textarea
            id="composer-input"
            ref={textareaRef}
            value={text}
            rows={1}
            maxLength={MAX_CHARS}
            disabled={disabled}
            aria-describedby={hintId}
            placeholder="Message the model…"
            onChange={(event) => update(event.target.value)}
            onKeyDown={onKeyDown}
            className="max-h-52 min-h-8 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-[15px] leading-6 text-fg placeholder:text-fg-subtle focus:outline-none disabled:opacity-60"
          />
          {isBusy ? (
            <button
              type="button"
              aria-label="Stop"
              onClick={onStop}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-fg text-bg hover:opacity-90"
            >
              <StopIcon className="size-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={disabled || !trimmed}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40"
            >
              <SendIcon className="size-4" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-xs text-fg-subtle">
          <p id={hintId}>Enter to send · Shift+Enter for a new line</p>
          <div className="flex items-center gap-3">
            {text.length > COUNTER_THRESHOLD ? (
              <p aria-live="polite">
                {text.length} / {MAX_CHARS}
              </p>
            ) : null}
            {contextMeter}
          </div>
        </div>
      </div>
    </form>
  );
}
