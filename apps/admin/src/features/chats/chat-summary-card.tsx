import { toErrorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useChatSummary } from './use-chat-summary';

function Skeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {['w-full', 'w-11/12', 'w-2/3'].map((w) => (
        <div
          key={w}
          className={`h-3 ${w} animate-pulse rounded bg-border motion-reduce:animate-none`}
        />
      ))}
    </div>
  );
}

function Status({ children }: { children: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-sm text-fg-muted"
    >
      <span
        aria-hidden="true"
        className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-accent motion-reduce:animate-none"
      />
      {children}
    </p>
  );
}

export function ChatSummaryCard({ chatId }: { chatId: string }) {
  const { state, isLoading, isUpdating, error, retry } = useChatSummary(chatId);
  const hasError = Boolean(error);
  const content = state?.content ?? null;
  const pending = state?.pendingMessages ?? 0;

  let body;
  if (isLoading) {
    body = <Skeleton />;
  } else if (content === null && !hasError && !isUpdating && !state?.stale) {
    body = <p className="text-sm text-fg-muted">Nothing to summarize yet.</p>;
  } else {
    body = (
      <>
        {content === null ? (
          !hasError && <Skeleton />
        ) : (
          <p
            className={`whitespace-pre-wrap break-words text-sm ${isUpdating ? 'opacity-60' : ''}`}
          >
            {content}
          </p>
        )}
        {!hasError && isUpdating && content === null && (
          <Status>Generating summary…</Status>
        )}
        {!hasError && isUpdating && content !== null && (
          <Status>
            {pending > 0
              ? `Updating with ${pending} new message${pending === 1 ? '' : 's'}…`
              : 'Updating summary…'}
          </Status>
        )}
        {!isUpdating && content !== null && state && (
          <p className="text-xs text-fg-subtle">
            Updated {formatDateTime(state.generatedAt)}
            {state.model ? ` · ${state.model}` : ''}
          </p>
        )}
        {!hasError && !isUpdating && state?.stale && pending > 0 && (
          <p className="text-xs text-fg-subtle">
            {pending} new message{pending === 1 ? '' : 's'} since this summary.
          </p>
        )}
        {hasError && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-danger">
              {toErrorMessage(error)}
            </p>
            <button
              type="button"
              onClick={retry}
              className="text-sm text-accent hover:underline"
            >
              Retry
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">
        Admin summary{' '}
        <span className="font-normal text-fg-subtle">
          · visible to admins only
        </span>
      </h2>
      {body}
    </section>
  );
}
