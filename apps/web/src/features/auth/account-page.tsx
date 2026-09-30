import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, toErrorMessage } from '../../lib/api';
import { useAuthActions, useAuthUser } from './use-auth';

const sessionsKey = ['auth', 'sessions'] as const;

export function AccountPage() {
  const user = useAuthUser();
  const queryClient = useQueryClient();
  const { signOutAll } = useAuthActions();
  const sessions = useQuery({
    queryKey: sessionsKey,
    queryFn: api.listSessions,
    enabled: Boolean(user.data),
  });
  const revoke = useMutation({
    mutationFn: api.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionsKey }),
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-8">
      <Link to="/" className="text-sm text-cyan-300 hover:underline">
        ← Back to chat
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100">Account</h1>

      {user.isPending ? (
        <p role="status" className="mt-6 text-slate-400">
          Loading account…
        </p>
      ) : !user.data ? (
        <p className="mt-6 text-slate-300">
          Sign in from the chat sidebar to manage your devices.
        </p>
      ) : (
        <>
          <p className="mt-2 text-slate-400">
            Signed in as{' '}
            <span className="text-slate-200">
              {user.data.displayName ?? user.data.email}
            </span>
          </p>

          <section aria-labelledby="sessions-heading" className="mt-8">
            <div className="flex items-center justify-between gap-4">
              <h2 id="sessions-heading" className="text-lg font-medium">
                Device sessions
              </h2>
              <button
                type="button"
                className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10"
                disabled={signOutAll.isPending}
                onClick={() => signOutAll.mutate()}
              >
                Sign out everywhere
              </button>
            </div>
            {sessions.isPending ? (
              <p role="status" className="mt-4 text-sm text-slate-400">
                Loading sessions…
              </p>
            ) : sessions.isError ? (
              <p role="alert" className="mt-4 text-sm text-rose-300">
                {toErrorMessage(sessions.error)}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-800 rounded-xl border border-slate-800">
                {sessions.data.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="min-w-0 text-sm">
                      <p className="truncate text-slate-200">
                        {session.userAgent ?? 'Unknown device'}
                        {session.current ? (
                          <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs text-emerald-300">
                            This device
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-slate-500">
                        Last used{' '}
                        {new Date(session.lastUsedAt).toLocaleString()}
                      </p>
                    </div>
                    {session.current ? null : (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(session.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {revoke.isError ? (
              <p role="alert" className="mt-3 text-sm text-rose-300">
                {toErrorMessage(revoke.error)}
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}
