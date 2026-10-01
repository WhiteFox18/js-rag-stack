import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ApiClientError } from '@js-rag-stack/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { RequireAdmin } from './require-admin';

const api = vi.hoisted(() => ({ getMe: vi.fn(), signOut: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderGuarded() {
  return renderWithProviders({
    route: '/users',
    ui: (
      <Routes>
        <Route element={<RequireAdmin />}>
          <Route path="/users" element={<p>Secret users</p>} />
        </Route>
        <Route path="/login" element={<p>Login screen</p>} />
      </Routes>
    ),
  });
}

describe('RequireAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects to login when unauthenticated', async () => {
    api.getMe.mockRejectedValue(new ApiClientError(401, 'UNAUTHORIZED', 'no'));
    renderGuarded();
    expect(await screen.findByText('Login screen')).toBeInTheDocument();
  });

  it('renders the shell with nav and signs out', async () => {
    api.getMe.mockResolvedValue({
      admin: { id: 'a', email: 'ops@example.com', displayName: null },
    });
    api.signOut.mockResolvedValue(undefined);
    renderGuarded();
    expect(await screen.findByText('Secret users')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute(
      'href',
      '/users',
    );
    expect(screen.getByRole('link', { name: 'Anonymous' })).toHaveAttribute(
      'href',
      '/anonymous',
    );
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute(
      'href',
      '/models',
    );
    expect(screen.getByText('ops@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Login screen')).toBeInTheDocument();
  });
});
