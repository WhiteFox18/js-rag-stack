import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, toErrorMessage } from '../../lib/api';
import { ADMIN_QUERY_KEY } from './use-admin';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const signIn = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api.signIn(input),
    onSuccess: (data) => {
      queryClient.setQueryData(ADMIN_QUERY_KEY, data);
      void navigate('/users', { replace: true });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    signIn.mutate({ email, password });
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6"
      >
        <h1 className="text-lg font-semibold text-fg">Admin sign in</h1>
        <label className="block space-y-1 text-sm">
          <span className="text-fg-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-fg focus:border-accent"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-fg-muted">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-fg focus:border-accent"
          />
        </label>
        {signIn.isError && (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {toErrorMessage(signIn.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={signIn.isPending}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
