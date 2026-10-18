import { ApiClientError } from '@js-rag-stack/api-client';
import type { AdminChatOwner } from '@js-rag-stack/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, toErrorMessage } from '../../lib/api';
import { formatDateTime, shortId } from '../../lib/format';
import { ChatTranscript } from './chat-transcript';

function ownerPath(owner: AdminChatOwner): string {
  if (owner?.type === 'user') return `/users/${owner.id}`;
  if (owner?.type === 'anonymous') return `/anonymous/${owner.id}`;
  return '/users';
}

function OwnerLabel({ owner }: { owner: AdminChatOwner }) {
  if (!owner) return <span>Deleted owner</span>;
  return (
    <Link to={ownerPath(owner)} className="text-accent hover:underline">
      {owner.type === 'user' ? owner.email : `Anonymous ${shortId(owner.id)}`}
    </Link>
  );
}

export function AdminChatPage() {
  const { chatId = '' } = useParams();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['chats', chatId],
    queryFn: () => api.getChat(chatId),
  });
  const owner = query.data?.chat.owner ?? null;

  function goBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) void navigate(-1);
    else void navigate(ownerPath(owner));
  }

  const notFound =
    query.error instanceof ApiClientError && query.error.status === 404;

  return (
    <section className="space-y-4">
      <button
        type="button"
        onClick={goBack}
        className="text-sm text-accent hover:underline"
      >
        ← Back
      </button>
      {query.isError && (
        <p role="alert" className="text-sm text-danger">
          {notFound
            ? 'This chat no longer exists.'
            : toErrorMessage(query.error)}
        </p>
      )}
      {query.data && (
        <>
          <header className="space-y-1">
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              {query.data.chat.title}
              {query.data.chat.archivedAt && (
                <span className="rounded border border-border px-1.5 py-0.5 text-xs font-normal text-fg-muted">
                  Archived
                </span>
              )}
            </h1>
            <p className="text-sm text-fg-muted">
              <OwnerLabel owner={query.data.chat.owner} /> ·{' '}
              {query.data.chat.model} · created{' '}
              {formatDateTime(query.data.chat.createdAt)}
            </p>
          </header>
          <ChatTranscript messages={query.data.messages} />
        </>
      )}
    </section>
  );
}
