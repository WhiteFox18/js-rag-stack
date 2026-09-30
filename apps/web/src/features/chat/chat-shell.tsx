import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useMatch } from 'react-router-dom';
import { api } from '../../lib/api';
import { AuthDialog } from '../auth/auth-dialog';
import type { AuthMode } from '../auth/auth.types';
import { useAuthUser } from '../auth/use-auth';
import { ChatSidebar } from './chat-sidebar';
import { ReadinessBanner } from './readiness-banner';

export function ChatShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<AuthMode | null>(null);
  const user = useAuthUser();
  const match = useMatch('/chats/:chatId');
  const readiness = useQuery({
    queryKey: ['readiness'],
    queryFn: api.getReadiness,
    refetchInterval: 30_000,
  });

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <aside
        id="chat-sidebar"
        aria-label="Sidebar"
        className={`${
          sidebarOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'
        } w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950 md:static md:flex`}
      >
        <ChatSidebar
          user={user.data ?? null}
          activeChatId={match?.params.chatId}
          onNavigate={() => setSidebarOpen(false)}
          onSignIn={() => setDialogMode('sign-in')}
          onSignUp={() => setDialogMode('sign-up')}
        />
      </aside>
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-slate-950/70 md:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-2 md:hidden">
          <button
            type="button"
            aria-label="Toggle chat history"
            aria-expanded={sidebarOpen}
            aria-controls="chat-sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-sm"
          >
            ☰
          </button>
          <span className="text-sm font-semibold text-cyan-300">
            Local LLM Chat
          </span>
        </header>
        {readiness.data ? <ReadinessBanner readiness={readiness.data} /> : null}
        {readiness.isError ? (
          <div
            role="alert"
            className="border-b border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm text-rose-200"
          >
            The API is unreachable. Confirm the backend is running.
          </div>
        ) : null}
        <Outlet />
      </div>

      {dialogMode ? (
        <AuthDialog
          initialMode={dialogMode}
          onClose={() => setDialogMode(null)}
        />
      ) : null}
    </div>
  );
}
