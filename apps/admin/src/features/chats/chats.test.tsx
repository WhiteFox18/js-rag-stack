import { screen } from '@testing-library/react';
import { ApiClientError } from '@js-rag-stack/api-client';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChatDetail } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { AdminChatPage } from './admin-chat-page';

const api = vi.hoisted(() => ({ getChat: vi.fn() }));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderPage() {
  return renderWithProviders({
    route: '/chats/c1',
    ui: (
      <Routes>
        <Route path="/chats/:chatId" element={<AdminChatPage />} />
      </Routes>
    ),
  });
}

describe('AdminChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getChat.mockResolvedValue(makeChatDetail());
  });

  it('shows title, model and user owner link', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Planning a trip' }),
    ).toBeInTheDocument();
    const owner = screen.getByRole('link', { name: 'ada@example.com' });
    expect(owner).toHaveAttribute(
      'href',
      '/users/0199a000-0000-7000-8000-000000000001',
    );
    expect(api.getChat).toHaveBeenCalledWith('c1');
  });

  it('links anonymous owner with short id', async () => {
    api.getChat.mockResolvedValue(
      makeChatDetail({ owner: { type: 'anonymous', id: 'abcdef1234567890' } }),
    );
    renderPage();
    const link = await screen.findByRole('link', { name: /abcdef12/ });
    expect(link).toHaveAttribute('href', '/anonymous/abcdef1234567890');
  });

  it('shows deleted owner', async () => {
    api.getChat.mockResolvedValue(makeChatDetail({ owner: null }));
    renderPage();
    expect(await screen.findByText('Deleted owner')).toBeInTheDocument();
  });

  it('lists transcript blocks in order', async () => {
    renderPage();
    await screen.findByText('Hello there');
    const text = document.body.textContent ?? '';
    expect(text).toContain('Assistant · qwen2.5:1.5b');
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(text.indexOf('Hello there')).toBeLessThan(
      text.indexOf('Hi, how can I help?'),
    );
  });

  it('badges failed messages', async () => {
    const base = makeChatDetail();
    api.getChat.mockResolvedValue({
      ...base,
      messages: [{ ...base.messages[1]!, status: 'failed' }],
    });
    renderPage();
    expect(await screen.findByText('failed')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    api.getChat.mockResolvedValue(makeChatDetail({ messages: [] }));
    renderPage();
    expect(await screen.findByText('No messages.')).toBeInTheDocument();
  });

  it('shows not-found message on 404', async () => {
    api.getChat.mockRejectedValue(new ApiClientError(404, 'NOT_FOUND', 'x'));
    renderPage();
    expect(
      await screen.findByText('This chat no longer exists.'),
    ).toBeInTheDocument();
  });

  it('shows Archived badge', async () => {
    api.getChat.mockResolvedValue(
      makeChatDetail({ archivedAt: '2026-10-01T00:00:00.000Z' }),
    );
    renderPage();
    expect(await screen.findByText('Archived')).toBeInTheDocument();
  });
});
