import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { PencilIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { Menu } from '../../components/menu';
import { api, toErrorMessage } from '../../lib/api';
import { useAuthActions } from '../auth/use-auth';
import { groupChatsByRecency } from './chat.helpers';
import type {
  ChatGroupsProps,
  ChatListItemProps,
  ChatSidebarProps,
} from './chat.types';

const secondaryButton =
  'rounded-lg border border-border px-3 py-1.5 text-fg hover:bg-surface-2';

function ChatListItem({ chat, active, onNavigate }: ChatListItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const rename = useMutation({
    mutationFn: (next: string) => api.updateChat(chat.id, { title: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chats'] }),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteChat(chat.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
      queryClient.removeQueries({ queryKey: ['chats', 'detail', chat.id] });
      if (active) void navigate('/chats');
    },
  });

  const submitRename = (event: FormEvent) => {
    event.preventDefault();
    const next = title.trim();
    if (next && next !== chat.title) rename.mutate(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <li>
        <form onSubmit={submitRename} className="px-1 py-0.5">
          <label className="sr-only" htmlFor={`rename-${chat.id}`}>
            Chat title
          </label>
          <input
            id={`rename-${chat.id}`}
            autoFocus
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditing(false);
            }}
            className="w-full rounded-md border border-accent bg-bg px-2 py-1.5 text-sm text-fg"
          />
        </form>
      </li>
    );
  }

  return (
    <li className="group relative">
      <Link
        to={`/chats/${chat.id}`}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={`block truncate rounded-lg py-2 pr-10 pl-3 text-sm ${
          active
            ? 'bg-surface-2 font-medium text-fg'
            : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
        }`}
      >
        {chat.title}
      </Link>
      <div className="absolute inset-y-0 right-1 flex items-center can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100">
        <Menu
          label={`Actions for ${chat.title}`}
          triggerClassName="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-bg hover:text-fg"
          items={[
            {
              label: 'Rename',
              icon: <PencilIcon className="size-4" />,
              onSelect: () => {
                setTitle(chat.title);
                setEditing(true);
              },
            },
            {
              label: 'Delete',
              icon: <TrashIcon className="size-4" />,
              tone: 'danger',
              onSelect: () => setConfirming(true),
            },
          ]}
        />
      </div>
      {confirming ? (
        <ConfirmDialog
          title="Delete chat?"
          description={`"${chat.title}" and all of its messages will be permanently deleted.`}
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            remove.mutate();
          }}
        />
      ) : null}
    </li>
  );
}

function ChatGroups({ activeChatId, onNavigate }: ChatGroupsProps) {
  const chats = useInfiniteQuery({
    queryKey: ['chats', 'list'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api.listChats({ cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

  if (chats.isPending) {
    return (
      <p role="status" className="px-3 py-2 text-sm text-fg-subtle">
        Loading chats…
      </p>
    );
  }
  if (chats.isError) {
    return (
      <p role="alert" className="px-3 py-2 text-sm text-danger">
        {toErrorMessage(chats.error)}
      </p>
    );
  }

  const groups = groupChatsByRecency({
    chats: chats.data.pages.flatMap((page) => page.chats),
    now: new Date(),
  });

  if (groups.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-fg-subtle">
        No chats yet. Start a new one!
      </p>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="mb-4">
          <h2 className="px-3 py-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
            {group.label}
          </h2>
          <ul className="space-y-0.5">
            {group.chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                active={chat.id === activeChatId}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </section>
      ))}
      {chats.hasNextPage ? (
        <button
          type="button"
          disabled={chats.isFetchingNextPage}
          onClick={() => void chats.fetchNextPage()}
          className="mx-3 mb-3 text-sm text-accent hover:underline disabled:opacity-60"
        >
          {chats.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </button>
      ) : null}
    </>
  );
}

export function ChatSidebar({
  user,
  activeChatId,
  onNavigate,
  onSignIn,
  onSignUp,
}: ChatSidebarProps) {
  const { signOut } = useAuthActions();

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Link
          to="/chats"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2"
        >
          <PlusIcon className="size-4" />
          New chat
        </Link>
      </div>
      <nav aria-label="Chat history" className="flex-1 overflow-y-auto px-2">
        <ChatGroups activeChatId={activeChatId} onNavigate={onNavigate} />
      </nav>
      <div className="space-y-3 border-t border-border p-3 text-sm">
        {user ? (
          <div className="space-y-2">
            <p className="truncate font-medium text-fg">
              {user.displayName ?? user.email}
            </p>
            <div className="flex gap-2">
              <Link
                to="/account"
                onClick={onNavigate}
                className={secondaryButton}
              >
                Account
              </Link>
              <button
                type="button"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
                className={secondaryButton}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-fg-muted">
              Chatting anonymously. Sign in to keep chats across devices.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-fg hover:bg-accent-hover"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={onSignUp}
                className={secondaryButton}
              >
                Sign up
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
