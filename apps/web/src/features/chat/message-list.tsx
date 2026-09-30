import { Fragment, Suspense, lazy } from 'react';
import { CopyButton } from '../../components/copy-button';
import { ArrowDownIcon } from '../../components/icons';
import {
  PENDING_PROMPT_ID,
  describeTokens,
  isPendingVisible,
  visibleServerMessages,
} from './chat.helpers';
import type {
  AssistantMessageProps,
  MessageListProps,
  UserMessageProps,
} from './chat.types';
import type { MarkdownContentProps } from './chat.types';

// react-markdown and remark-gfm are heavy; keep them out of the entry chunk.
const MarkdownContent = lazy(() =>
  import('./markdown').then((module) => ({ default: module.MarkdownContent })),
);

function LazyMarkdown(props: MarkdownContentProps) {
  return (
    <Suspense
      fallback={
        <p className="break-words whitespace-pre-wrap">{props.content}</p>
      }
    >
      <MarkdownContent {...props} />
    </Suspense>
  );
}

const STATUS_CHIP = {
  failed: { label: 'Response failed', className: 'bg-danger-soft text-danger' },
  cancelled: { label: 'Stopped', className: 'bg-warning-soft text-warning' },
  streaming: { label: 'Incomplete', className: 'bg-warning-soft text-warning' },
} as const;

const ACTION_ROW =
  'mt-1 flex items-center gap-1 transition-opacity can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100 can-hover:has-open:opacity-100';

function UserMessage({ id, content }: UserMessageProps) {
  return (
    <li className="group flex flex-col items-end">
      <article
        aria-label="You"
        data-prompt-id={id}
        tabIndex={-1}
        className="max-w-[75%] rounded-2xl bg-surface-2 px-4 py-2.5 text-[15px] leading-7 text-fg"
      >
        <p className="break-words whitespace-pre-wrap">{content}</p>
      </article>
      <div className={ACTION_ROW}>
        <CopyButton text={content} label="Copy prompt" />
      </div>
    </li>
  );
}

function ThinkingIndicator() {
  return (
    <span
      role="status"
      aria-label="Assistant is thinking"
      className="inline-flex gap-1 py-2"
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="thinking-dot size-1.5 rounded-full bg-fg-subtle"
          style={{ animationDelay: `${index * 150}ms` }}
        />
      ))}
    </span>
  );
}

function SummarizingIndicator() {
  return (
    <p role="status" className="py-2 text-sm text-fg-subtle">
      Summarizing earlier messages…
    </p>
  );
}

function SummaryDivider({ summary }: { summary: string }) {
  return (
    <li>
      <details className="text-center text-xs text-fg-subtle">
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden rounded-md px-2 py-1 select-none hover:text-fg">
          <span aria-hidden="true" className="h-px w-10 bg-border" />
          Earlier messages summarized
          <span aria-hidden="true" className="h-px w-10 bg-border" />
        </summary>
        <p className="mx-auto mt-2 max-w-2xl rounded-lg bg-surface-2 px-4 py-3 text-left text-sm leading-6 whitespace-pre-wrap text-fg-muted">
          {summary}
        </p>
      </details>
    </li>
  );
}

function AssistantMessage({
  content,
  streaming,
  summarizing,
  status,
  details,
}: AssistantMessageProps) {
  const chip = status && status !== 'completed' ? STATUS_CHIP[status] : null;

  return (
    <li className="group">
      <article
        aria-label="Assistant"
        aria-busy={streaming || undefined}
        className="text-[15px] text-fg"
      >
        {content ? (
          <LazyMarkdown content={content} streaming={streaming} />
        ) : streaming ? (
          summarizing ? (
            <SummarizingIndicator />
          ) : (
            <ThinkingIndicator />
          )
        ) : null}
        {chip && !streaming ? (
          <span
            className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}
          >
            {chip.label}
          </span>
        ) : null}
      </article>
      {streaming ? null : (
        <div className={ACTION_ROW}>
          {content ? <CopyButton text={content} label="Copy response" /> : null}
          {details.length > 0 ? (
            <details className="text-xs text-fg-subtle">
              <summary className="cursor-pointer rounded-md px-1.5 py-1 select-none hover:bg-surface-2 hover:text-fg">
                Details
              </summary>
              <ul className="mt-1 space-y-0.5 px-1.5 font-mono">
                {details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </li>
  );
}

export function MessageList({
  messages,
  pending,
  hasOlder,
  isLoadingOlder,
  onLoadOlder,
  scroll,
  summary = null,
  summarizedThroughMessageId = null,
}: MessageListProps) {
  const {
    containerRef,
    contentRef,
    isAtBottom,
    preserveScrollPosition,
    scrollToBottom,
  } = scroll;
  const serverMessages = visibleServerMessages({ messages, pending });

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={containerRef}
        data-scroll-container
        className="relative h-full overflow-y-auto [overflow-anchor:none]"
      >
        <div ref={contentRef} className="mx-auto max-w-3xl px-4 py-8">
          {hasOlder ? (
            <div className="mb-6 text-center">
              <button
                type="button"
                disabled={isLoadingOlder}
                onClick={() => {
                  preserveScrollPosition();
                  onLoadOlder();
                }}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-60"
              >
                {isLoadingOlder ? 'Loading…' : 'Load earlier messages'}
              </button>
            </div>
          ) : null}
          <ol
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            className="space-y-8"
          >
            {serverMessages.map((message) => (
              <Fragment key={message.id}>
                {message.role === 'user' ? (
                  <UserMessage id={message.id} content={message.content} />
                ) : (
                  <AssistantMessage
                    content={message.content}
                    streaming={false}
                    status={message.status}
                    details={describeTokens(message)}
                  />
                )}
                {summary && message.id === summarizedThroughMessageId ? (
                  <SummaryDivider summary={summary} />
                ) : null}
              </Fragment>
            ))}
            {isPendingVisible(pending) ? (
              <>
                <UserMessage
                  id={PENDING_PROMPT_ID}
                  content={pending.userContent}
                />
                <AssistantMessage
                  content={pending.assistantText}
                  streaming
                  summarizing={pending.summarizing}
                  status={null}
                  details={[]}
                />
              </>
            ) : null}
          </ol>
        </div>
      </div>
      {isAtBottom ? null : (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1.5 text-sm text-fg shadow-md hover:bg-surface"
        >
          <ArrowDownIcon className="size-4" />
          Jump to latest
        </button>
      )}
    </div>
  );
}
