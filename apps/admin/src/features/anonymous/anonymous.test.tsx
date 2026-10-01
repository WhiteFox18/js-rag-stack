import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAnonymous, makeTotals } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { AnonymousDetailPage } from './anonymous-detail-page';
import { AnonymousPage } from './anonymous-page';

const api = vi.hoisted(() => ({
  listAnonymousSessions: vi.fn(),
  getAnonymousSession: vi.fn(),
  getAnonymousSessionUsage: vi.fn(),
}));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

const item = makeAnonymous();

function renderAt(route: string) {
  return renderWithProviders({
    route,
    ui: (
      <Routes>
        <Route path="/anonymous" element={<AnonymousPage />} />
        <Route path="/anonymous/:sessionId" element={<AnonymousDetailPage />} />
      </Routes>
    ),
  });
}

describe('anonymous pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listAnonymousSessions.mockResolvedValue({
      items: [item],
      page: 1,
      pageSize: 25,
      total: 1,
    });
  });

  it('lists sessions with short id link, chat count and totals', async () => {
    renderAt('/anonymous');
    const table = await screen.findByRole('table', {
      name: 'Anonymous sessions',
    });
    const link = within(table).getByRole('link', { name: '0199a000' });
    expect(link).toHaveAttribute('href', `/anonymous/${item.id}`);
    expect(within(table).getByText('2')).toBeInTheDocument();
    expect(within(table).getByText('1,200')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(api.listAnonymousSessions).toHaveBeenCalledWith({
      page: 1,
      sort: 'lastActivity',
      from: undefined,
      to: undefined,
    });
  });

  it('sorts and filters by date, resetting to page 1', async () => {
    renderAt('/anonymous?page=2');
    await screen.findByRole('table', { name: 'Anonymous sessions' });
    await userEvent.selectOptions(
      screen.getByLabelText('Sort by'),
      'totalTokens',
    );
    await userEvent.type(screen.getByLabelText('From'), '2026-09-01');
    await waitFor(() =>
      expect(api.listAnonymousSessions).toHaveBeenLastCalledWith({
        page: 1,
        sort: 'totalTokens',
        from: new Date(2026, 8, 1).toISOString(),
        to: undefined,
      }),
    );
  });

  it('shows session detail with totals, breakdown and log', async () => {
    api.getAnonymousSession.mockResolvedValue({
      session: {
        id: item.id,
        createdAt: item.createdAt,
        lastSeenAt: item.lastSeenAt,
        expiresAt: item.expiresAt,
        chatCount: 2,
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
    api.getAnonymousSessionUsage.mockResolvedValue({
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
    renderAt(`/anonymous/${item.id}`);
    expect(
      await screen.findByRole('heading', { name: 'Session 0199a000' }),
    ).toBeInTheDocument();
    for (const label of ['Created', 'Last seen', 'Expires', 'Chats']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Chats').nextElementSibling).toHaveTextContent('2');
    expect(
      screen.getByRole('table', { name: 'Usage by model' }),
    ).toHaveTextContent('chat');
    expect(
      await screen.findByRole('table', { name: 'Usage log' }),
    ).toHaveTextContent('summary');
  });

  it('shows not found for unknown sessions', async () => {
    const { ApiClientError } = await import('@js-rag-stack/api-client');
    const error = new ApiClientError(404, 'NOT_FOUND', 'Session not found.');
    api.getAnonymousSession.mockRejectedValue(error);
    api.getAnonymousSessionUsage.mockRejectedValue(error);
    renderAt('/anonymous/missing');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Session not found.',
    );
  });
});
