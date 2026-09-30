import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useMatch } from 'react-router-dom';
import { MenuIcon, PanelLeftIcon } from '../../components/icons';
import { api } from '../../lib/api';
import { readStorage, writeStorage } from '../../lib/storage';
import { AuthDialog } from '../auth/auth-dialog';
import type { AuthMode } from '../auth/auth.types';
import { useAuthUser } from '../auth/use-auth';
import { ChatSidebar } from './chat-sidebar';
import { ReadinessBanner } from './readiness-banner';
import { ThemeToggle } from './theme-toggle';

const SIDEBAR_COLLAPSED_KEY = 'sidebar:collapsed';

const iconButton =
  'grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg';

export function ChatShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => readStorage(SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [dialogMode, setDialogMode] = useState<AuthMode | null>(null);
  const user = useAuthUser();
  const match = useMatch('/chats/:chatId');
  const readiness = useQuery({
    queryKey: ['readiness'],
    queryFn: api.getReadiness,
    refetchInterval: 30_000,
  });

  const setCollapsedAndRemember = (next: boolean) => {
    setCollapsed(next);
    writeStorage({ key: SIDEBAR_COLLAPSED_KEY, value: next ? 'true' : null });
  };

  return (
    <div className="flex h-screen bg-bg text-fg">
      <aside
        id="chat-sidebar"
        aria-label="Sidebar"
        className={`${
          sidebarOpen ? 'fixed inset-y-0 left-0 z-40 flex' : 'hidden'
        } w-72 shrink-0 flex-col border-r border-border bg-surface ${
          collapsed ? 'md:hidden' : 'md:static md:flex'
        }`}
      >
        <ChatSidebar
          user={user.data ?? null}
          activeChatId={match?.params.chatId}
          onNavigate={() => setSidebarOpen(false)}
          onSignIn={() => setDialogMode('sign-in')}
          onSignUp={() => setDialogMode('sign-up')}
          onCollapse={() => setCollapsedAndRemember(true)}
        />
      </aside>
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={`flex items-center gap-2 border-b border-border px-2 py-1.5 ${
            collapsed ? '' : 'md:hidden'
          }`}
        >
          <button
            type="button"
            aria-label="Toggle chat history"
            aria-expanded={sidebarOpen}
            aria-controls="chat-sidebar"
            onClick={() => setSidebarOpen((open) => !open)}
            className={`${iconButton} md:hidden`}
          >
            <MenuIcon className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Show sidebar"
            onClick={() => setCollapsedAndRemember(false)}
            className={`${iconButton} hidden md:grid`}
          >
            <PanelLeftIcon className="size-4" />
          </button>
          <span className="text-sm font-semibold text-fg">Local LLM Chat</span>
          {collapsed ? (
            <div className="ml-auto hidden md:flex">
              <ThemeToggle />
            </div>
          ) : null}
        </header>
        {readiness.data ? <ReadinessBanner readiness={readiness.data} /> : null}
        {readiness.isError ? (
          <div
            role="alert"
            className="border-b border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger"
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
