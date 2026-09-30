import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '@js-rag-stack/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { AuthDialog } from './auth-dialog';

const { signIn, signUp } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api: { signIn, signUp, signOut: vi.fn(), signOutAll: vi.fn() },
}));

describe('AuthDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signs in and closes', async () => {
    signIn.mockResolvedValue({ user: {} });
    const onClose = vi.fn();
    renderWithProviders({
      ui: <AuthDialog initialMode="sign-in" onClose={onClose} />,
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(signIn.mock.calls[0]?.[0]).toEqual({
      email: 'a@b.co',
      password: 'password123',
    });
  });

  it('shows API errors and can switch to sign up', async () => {
    signIn.mockRejectedValue(
      new ApiClientError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid email or password.',
      ),
    );
    renderWithProviders({
      ui: <AuthDialog initialMode="sign-in" onClose={vi.fn()} />,
    });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password.',
    );
    await user.click(screen.getByRole('button', { name: /Sign up/ }));
    expect(screen.getByLabelText(/Display name/)).toBeInTheDocument();
  });
});
