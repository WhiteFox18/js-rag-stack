import type { AdminChatMessage } from '@js-rag-stack/contracts';
import { formatDateTime } from '../../lib/format';

export function ChatTranscript({ messages }: { messages: AdminChatMessage[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-fg-muted">No messages.</p>;
  }
  return (
    <ol className="space-y-4">
      {messages.map((message) => (
        <li key={message.id} className="space-y-1 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span className="font-medium">
              {message.role === 'user'
                ? 'User'
                : `Assistant · ${message.model ?? 'unknown model'}`}
            </span>
            <span className="text-fg-subtle">
              {formatDateTime(message.createdAt)}
            </span>
            {message.status !== 'completed' && (
              <span
                className={
                  message.status === 'failed' ? 'text-danger' : 'text-fg-subtle'
                }
              >
                {message.status}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.content}
          </p>
        </li>
      ))}
    </ol>
  );
}
