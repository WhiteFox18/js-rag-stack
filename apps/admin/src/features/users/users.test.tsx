import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTotals, makeUser } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { UserDetailPage } from './user-detail-page';
import { UsersPage } from './users-page';

const api = vi.hoisted(() => ({
  listUsers: vi.fn(),
  getUser: vi.fn(),
  getUserUsage: vi.fn(),
}));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderAt(route: string) {
  return renderWithProviders({
    route,
    ui: (
      <Routes>
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:userId" element={<UserDetailPage />} />
      </Routes>
    ),
  });
}

describe('users pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listUsers.mockResolvedValue({
      items: [
        makeUser(),
        makeUser({
          id: 'u2',
          email: 'bob@example.com',
          displayName: null,
          usage: makeTotals({
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            lastActivityAt: null,
          }),
        }),
      ],
      page: 1,
      pageSize: 25,
      total: 2,
    });
  });

  it('lists users with totals and default sort', async () => {
    renderAt('/users');
    const table = await screen.findByRole('table', { name: 'Users' });
    expect(within(table).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(table).getByText('1,200')).toBeInTheDocument();
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
    expect(api.listUsers).toHaveBeenCalledWith({
      page: 1,
      sort: 'lastActivity',
      search: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it('searches, sorts and filters by date, resetting to page 1', async () => {
    renderAt('/users?page=2');
    await screen.findByRole('table', { name: 'Users' });
    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search users' }),
      'ada',
    );
    // Typing is debounced: no request carries a partial search term.
    expect(api.listUsers).not.toHaveBeenCalledWith(
      expect.objectContaining({ search: 'a' }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText('Sort by'),
      'totalTokens',
    );
    await userEvent.type(screen.getByLabelText('From'), '2026-09-01');
    await waitFor(() =>
      expect(api.listUsers).toHaveBeenLastCalledWith({
        page: 1,
        sort: 'totalTokens',
        search: 'ada',
        from: new Date(2026, 8, 1).toISOString(),
        to: undefined,
      }),
    );
  });

  it('links to user detail and shows totals, breakdown and log', async () => {
    api.getUser.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'ada@example.com',
        displayName: 'Ada',
        createdAt: '2026-09-01T10:00:00.000Z',
      },
      usage: makeTotals(),
      breakdown: [
        {
          model: 'qwen2.5:1.5b',
          kind: 'chat',
          requests: 3,
          inputTokens: 1200,
          outputTokens: 300,
        },
      ],
    });
    api.getUserUsage.mockResolvedValue({
      items: [
        {
          id: 'r1',
          createdAt: '2026-09-30T10:00:00.000Z',
          model: 'qwen2.5:1.5b',
          kind: 'summary',
          inputTokens: 40,
          outputTokens: 4,
          chatId: null,
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
    });
    renderAt('/users/u1');
    expect(
      await screen.findByRole('heading', { name: 'ada@example.com' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Usage by model' }),
    ).toHaveTextContent('chat');
    expect(
      await screen.findByRole('table', { name: 'Usage log' }),
    ).toHaveTextContent('summary');
  });

  it('keeps the heading and range filter mounted while the range changes', async () => {
    api.getUser.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'ada@example.com',
        displayName: 'Ada',
        createdAt: '2026-09-01T10:00:00.000Z',
      },
      usage: makeTotals(),
      breakdown: [],
    });
    api.getUserUsage.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    });
    renderAt('/users/u1');
    await screen.findByRole('heading', { name: 'ada@example.com' });
    const from = screen.getByLabelText('From');
    await userEvent.type(from, '2026-09-01');
    await waitFor(() =>
      expect(api.getUser).toHaveBeenLastCalledWith('u1', {
        from: new Date(2026, 8, 1).toISOString(),
        to: undefined,
      }),
    );
    expect(
      screen.getByRole('heading', { name: 'ada@example.com' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBe(from);
    expect(from).toHaveValue('2026-09-01');
  });

  it('shows an alert when the usage log fails to load', async () => {
    const { ApiClientError } = await import('@js-rag-stack/api-client');
    api.getUser.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'ada@example.com',
        displayName: 'Ada',
        createdAt: '2026-09-01T10:00:00.000Z',
      },
      usage: makeTotals(),
      breakdown: [],
    });
    api.getUserUsage.mockRejectedValue(
      new ApiClientError(500, 'INTERNAL', 'Usage log failed.'),
    );
    renderAt('/users/u1');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usage log failed.',
    );
  });

  it('shows not found for unknown users', async () => {
    const { ApiClientError } = await import('@js-rag-stack/api-client');
    api.getUser.mockRejectedValue(
      new ApiClientError(404, 'NOT_FOUND', 'User not found.'),
    );
    api.getUserUsage.mockRejectedValue(
      new ApiClientError(404, 'NOT_FOUND', 'User not found.'),
    );
    renderAt('/users/missing');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'User not found.',
    );
  });
});
