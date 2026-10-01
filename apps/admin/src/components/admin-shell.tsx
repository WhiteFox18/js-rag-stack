import type { AdminProfile } from '@js-rag-stack/contracts';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useSignOut } from '../features/auth/use-admin';

const NAV = [
  { to: '/users', label: 'Users' },
  { to: '/anonymous', label: 'Anonymous' },
  { to: '/models', label: 'Models' },
];

export function AdminShell({
  admin,
  children,
}: {
  admin: AdminProfile;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const signOut = useSignOut();

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-border bg-surface p-4 md:w-56 md:border-r md:border-b-0">
        <p className="text-sm font-semibold">Admin</p>
        <nav className="flex gap-1 md:flex-col">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-surface-2'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 text-xs text-fg-subtle">
          <p className="truncate">{admin.email}</p>
          <button
            type="button"
            onClick={() =>
              signOut.mutate(undefined, {
                onSettled: () => void navigate('/login', { replace: true }),
              })
            }
            className="rounded-lg border border-border px-2 py-1 text-fg-muted hover:bg-surface-2"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
