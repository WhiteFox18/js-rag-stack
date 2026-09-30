import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { toErrorMessage } from '../../lib/api';
import type { AuthDialogProps, AuthMode } from './auth.types';
import { useAuthActions } from './use-auth';

const fieldClass =
  'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-2 focus:outline-accent';

export function AuthDialog({ initialMode, onClose }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const { signIn, signUp } = useAuthActions();
  const titleId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const active = mode === 'sign-in' ? signIn : signUp;

  useEffect(() => {
    emailRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'sign-in') {
      signIn.mutate({ email, password }, { onSuccess: onClose });
      return;
    }
    signUp.mutate(
      { email, password, ...(displayName.trim() ? { displayName } : {}) },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl border border-border bg-bg p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-fg">
          {mode === 'sign-in' ? 'Sign in' : 'Create your account'}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Your anonymous chats move to your account automatically.
        </p>
        <form className="mt-5 space-y-4" onSubmit={submit}>
          {mode === 'sign-up' ? (
            <label className="block space-y-1 text-sm text-fg-muted">
              Display name (optional)
              <input
                className={fieldClass}
                value={displayName}
                maxLength={80}
                autoComplete="nickname"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
          ) : null}
          <label className="block space-y-1 text-sm text-fg-muted">
            Email
            <input
              ref={emailRef}
              className={fieldClass}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm text-fg-muted">
            Password
            <input
              className={fieldClass}
              type="password"
              required
              minLength={mode === 'sign-up' ? 8 : undefined}
              autoComplete={
                mode === 'sign-in' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {active.isError ? (
            <p role="alert" className="text-sm text-danger">
              {toErrorMessage(active.error)}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="text-sm text-accent underline-offset-4 hover:underline"
              onClick={() => {
                signIn.reset();
                signUp.reset();
                setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
              }}
            >
              {mode === 'sign-in'
                ? 'Need an account? Sign up'
                : 'Have an account? Sign in'}
            </button>
            <button
              type="submit"
              disabled={active.isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
            >
              {active.isPending
                ? 'Working…'
                : mode === 'sign-in'
                  ? 'Sign in'
                  : 'Sign up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
