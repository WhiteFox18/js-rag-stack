import { useEffect, useRef } from 'react';
import { describeTokens } from './chat.helpers';
import type { MessageBubbleProps, MessageListProps } from './chat.types';

const STATUS_LABEL: Record<string, string> = {
  failed: 'Response failed',
  cancelled: 'Stopped',
  streaming: 'Incomplete',
};

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const details = isUser ? [] : describeTokens(message);
  const statusLabel = STATUS_LABEL[message.status];

  return (
    <li className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <article
        aria-label={isUser ? 'You' : 'Assistant'}
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
          isUser
            ? 'bg-cyan-500/15 text-slate-100'
            : 'border border-slate-800 bg-slate-900 text-slate-200'
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {statusLabel && !isUser ? (
          <p className="mt-2 text-xs text-amber-300">{statusLabel}</p>
        ) : null}
        {details.length > 0 ? (
          <details className="mt-2 text-xs text-slate-500">
            <summary className="cursor-pointer select-none hover:text-slate-300">
              Details
            </summary>
            <ul className="mt-1 space-y-0.5 font-mono">
              {details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </article>
    </li>
  );
}

export function MessageList({
  messages,
  pending,
  hasOlder,
  isLoadingOlder,
  onLoadOlder,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const streamingVisible =
    pending?.status === 'streaming' && pending.userMessageId !== null;
  const serverMessages = pending
    ? messages.filter(
        (message) =>
          message.id !== pending.userMessageId &&
          message.id !== pending.assistantMessageId,
      )
    : messages;

  useEffect(() => {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [serverMessages.length, pending?.assistantText]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto max-w-3xl">
        {hasOlder ? (
          <div className="mb-4 text-center">
            <button
              type="button"
              disabled={isLoadingOlder}
              onClick={onLoadOlder}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-60"
            >
              {isLoadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        ) : null}
        <ol
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          className="space-y-4"
        >
          {serverMessages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {streamingVisible ? (
            <>
              <li className="flex justify-end">
                <article
                  aria-label="You"
                  className="max-w-[85%] rounded-2xl bg-cyan-500/15 px-4 py-3 text-sm leading-6 text-slate-100"
                >
                  <p className="whitespace-pre-wrap break-words">
                    {pending.userContent}
                  </p>
                </article>
              </li>
              <li className="flex justify-start">
                <article
                  aria-label="Assistant"
                  aria-busy="true"
                  className="max-w-[85%] rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm leading-6 text-slate-200"
                >
                  <p className="whitespace-pre-wrap break-words">
                    {pending.assistantText || (
                      <span className="text-slate-500">Thinking…</span>
                    )}
                  </p>
                </article>
              </li>
            </>
          ) : null}
        </ol>
      </div>
    </div>
  );
}
