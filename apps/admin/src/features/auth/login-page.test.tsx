import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ApiClientError } from '@js-rag-stack/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { LoginPage } from './login-page';

const api = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderLogin() {
  return renderWithProviders({
    route: '/login',
    ui: (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/users" element={<p>Users landing</p>} />
      </Routes>
    ),
  });
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('signs in and navigates to users', async () => {
    api.signIn.mockResolvedValue({
      admin: { id: 'a', email: 'a@b.co', displayName: null },
    });
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(
      screen.getByLabelText('Password'),
      'admin-password-123',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Users landing')).toBeInTheDocument();
    expect(api.signIn).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'admin-password-123',
    });
  });

  it('shows the server error', async () => {
    api.signIn.mockRejectedValue(
      new ApiClientError(401, 'UNAUTHORIZED', 'Invalid email or password.'),
    );
    renderLogin();
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'nope-nope-nope');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password.',
    );
  });
});
