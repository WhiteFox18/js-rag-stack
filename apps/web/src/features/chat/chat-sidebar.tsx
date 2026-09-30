import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, toErrorMessage } from '../../lib/api';
import { useAuthActions } from '../auth/use-auth';
import { groupChatsByRecency } from './chat.helpers';
import type {
  ChatGroupsProps,
  ChatListItemProps,
  ChatSidebarProps,
} from './chat.types';

function ChatListItem({ chat, active, onNavigate }: ChatListItemProps) {
  const [editing, setEditing] = useState(false);
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
        <form onSubmit={submitRename} className="px-2 py-1">
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
            className="w-full rounded-md border border-cyan-400 bg-slate-950 px-2 py-1 text-sm text-slate-100"
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
        className={`block truncate rounded-lg px-3 py-2 pr-16 text-sm ${
          active
            ? 'bg-slate-800 text-slate-100'
            : 'text-slate-300 hover:bg-slate-900'
        }`}
      >
        {chat.title}
      </Link>
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          aria-label={`Rename ${chat.title}`}
          onClick={() => {
            setTitle(chat.title);
            setEditing(true);
          }}
          className="rounded p-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-100"
        >
          ✎
        </button>
        <button
          type="button"
          aria-label={`Delete ${chat.title}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Delete "${chat.title}"?`)) remove.mutate();
          }}
          className="rounded p-1 text-xs text-slate-400 hover:bg-slate-700 hover:text-rose-300"
        >
          🗑
        </button>
      </div>
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
      <p role="status" className="px-3 py-2 text-sm text-slate-500">
        Loading chats…
      </p>
    );
  }
  if (chats.isError) {
    return (
      <p role="alert" className="px-3 py-2 text-sm text-rose-300">
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
      <p className="px-3 py-2 text-sm text-slate-500">
        No chats yet. Start a new one!
      </p>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="mb-3">
          <h2 className="px-3 py-1 text-xs font-medium tracking-wider text-slate-500 uppercase">
            {group.label}
          </h2>
          <ul>
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
          className="mx-3 mb-3 text-sm text-cyan-300 hover:underline disabled:opacity-60"
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
          className="block rounded-lg border border-slate-700 px-3 py-2 text-center text-sm font-medium text-slate-100 hover:bg-slate-900"
        >
          + New chat
        </Link>
      </div>
      <nav aria-label="Chat history" className="flex-1 overflow-y-auto px-1">
        <ChatGroups activeChatId={activeChatId} onNavigate={onNavigate} />
      </nav>
      <div className="border-t border-slate-800 p-3 text-sm">
        {user ? (
          <div className="space-y-2">
            <p className="truncate text-slate-300">
              {user.displayName ?? user.email}
            </p>
            <div className="flex gap-2">
              <Link
                to="/account"
                onClick={onNavigate}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-900"
              >
                Account
              </Link>
              <button
                type="button"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-900"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-slate-500">
              Chatting anonymously. Sign in to keep chats across devices.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSignIn}
                className="rounded-lg bg-cyan-400 px-3 py-1.5 font-semibold text-slate-950 hover:bg-cyan-300"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={onSignUp}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-900"
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
