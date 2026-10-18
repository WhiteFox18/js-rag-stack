import { act, screen } from '@testing-library/react';
import { ApiClientError } from '@js-rag-stack/api-client';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChatDetail, makeSummaryState } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { AdminChatPage } from './admin-chat-page';

const api = vi.hoisted(() => ({
  getChat: vi.fn(),
  getChatSummary: vi.fn(),
  refreshChatSummary: vi.fn(),
}));
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
    api.getChatSummary.mockResolvedValue(makeSummaryState());
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
    expect(screen.getByText(/last message/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Planning a trip',
    );
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

  it('badges cancelled and streaming messages', async () => {
    const base = makeChatDetail();
    api.getChat.mockResolvedValue({
      ...base,
      messages: [
        { ...base.messages[0]!, id: 'a', status: 'cancelled' },
        { ...base.messages[1]!, id: 'b', status: 'streaming' },
      ],
    });
    renderPage();
    expect(await screen.findByText('cancelled')).toBeInTheDocument();
    expect(screen.getByText('streaming')).toBeInTheDocument();
  });

  it('Back falls back to the owner page', async () => {
    renderWithProviders({
      route: '/chats/c1',
      ui: (
        <Routes>
          <Route path="/chats/:chatId" element={<AdminChatPage />} />
          <Route path="/users/:userId" element={<p>Owner route</p>} />
        </Routes>
      ),
    });
    await userEvent.click(await screen.findByRole('button', { name: /Back/ }));
    expect(await screen.findByText('Owner route')).toBeInTheDocument();
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

const fresh = (over = {}) =>
  makeSummaryState({
    content: 'The user plans a trip.',
    summarizedThroughMessageId: 'm1',
    model: 'qwen2.5:1.5b',
    generatedAt: '2026-10-17T10:00:00.000Z',
    ...over,
  });

describe('ChatSummaryCard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getChat.mockResolvedValue(makeChatDetail());
    api.getChatSummary.mockResolvedValue(makeSummaryState());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a fresh cached summary without refreshing', async () => {
    api.getChatSummary.mockResolvedValue(fresh());
    renderPage();
    expect(
      await screen.findByText('The user plans a trip.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Summarized through/)).toHaveTextContent(
      'qwen2.5:1.5b',
    );
    expect(api.refreshChatSummary).not.toHaveBeenCalled();
  });

  it('includes the admins-only notice in the heading', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: /visible to admins only/i }),
    ).toBeInTheDocument();
  });

  it('generates when there is no summary yet and stale', async () => {
    api.getChatSummary.mockResolvedValue(
      makeSummaryState({ stale: true, pendingMessages: 4 }),
    );
    let resolve!: (v: unknown) => void;
    api.refreshChatSummary.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Generating summary…',
    );
    act(() => resolve(fresh()));
    expect(
      await screen.findByText('The user plans a trip.'),
    ).toBeInTheDocument();
    expect(api.refreshChatSummary).toHaveBeenCalledTimes(1);
  });

  it('keeps old text while updating a stale summary', async () => {
    api.getChatSummary.mockResolvedValue(
      fresh({ stale: true, pendingMessages: 3 }),
    );
    let resolve!: (v: unknown) => void;
    api.refreshChatSummary.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderPage();
    expect(
      await screen.findByText('The user plans a trip.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Updating with 3 new messages…',
    );
    act(() =>
      resolve(
        fresh({ content: 'New text.', summarizedThroughMessageId: 'm4' }),
      ),
    );
    expect(await screen.findByText('New text.')).toBeInTheDocument();
    expect(screen.queryByText('The user plans a trip.')).toBeNull();
  });

  it('does not re-fire POST for the same pending count after success', async () => {
    const still = fresh({ stale: true, pendingMessages: 2 });
    api.getChatSummary.mockResolvedValue(still);
    api.refreshChatSummary.mockResolvedValue({
      ...still,
      content: 'Second text.',
    });
    renderPage();
    expect(await screen.findByText('Second text.')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 100));
    await vi.waitFor(() =>
      expect(api.refreshChatSummary).toHaveBeenCalledTimes(1),
    );
  });

  it('polls while generating and shows the result', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getChatSummary
      .mockResolvedValueOnce(
        makeSummaryState({ stale: true, pendingMessages: 4, generating: true }),
      )
      .mockResolvedValue(fresh());
    renderPage();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Generating summary…',
    );
    expect(api.refreshChatSummary).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      await screen.findByText('The user plans a trip.'),
    ).toBeInTheDocument();
    expect(api.refreshChatSummary).not.toHaveBeenCalled();
  });

  it('treats 409 as in progress and polls without an error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getChatSummary
      .mockResolvedValueOnce(
        makeSummaryState({ stale: true, pendingMessages: 4 }),
      )
      .mockResolvedValue(fresh());
    api.refreshChatSummary.mockRejectedValue(
      new ApiClientError(409, 'SUMMARY_IN_PROGRESS', 'busy'),
    );
    renderPage();
    await vi.waitFor(() =>
      expect(api.refreshChatSummary).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      await screen.findByText('The user plans a trip.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps old text on error and retries on demand', async () => {
    api.getChatSummary.mockResolvedValue(
      fresh({ stale: true, pendingMessages: 3 }),
    );
    api.refreshChatSummary.mockRejectedValueOnce(
      new ApiClientError(503, 'OLLAMA_UNAVAILABLE', 'Ollama is down'),
    );
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ollama is down',
    );
    expect(screen.getByText('The user plans a trip.')).toBeInTheDocument();
    expect(api.refreshChatSummary).toHaveBeenCalledTimes(1);
    api.refreshChatSummary.mockResolvedValue(fresh({ content: 'Recovered.' }));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Recovered.')).toBeInTheDocument();
    expect(api.refreshChatSummary).toHaveBeenCalledTimes(2);
  });

  it('shows empty state when there is nothing to summarize', async () => {
    api.getChatSummary.mockResolvedValue(makeSummaryState());
    renderPage();
    expect(
      await screen.findByText('Nothing to summarize yet.'),
    ).toBeInTheDocument();
  });

  it('re-arms auto-refresh after a 409 once the poll shows idle and stale', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.getChatSummary
      .mockResolvedValueOnce(
        makeSummaryState({ stale: true, pendingMessages: 4 }),
      )
      .mockResolvedValue(
        makeSummaryState({
          stale: true,
          pendingMessages: 4,
          generating: false,
        }),
      );
    api.refreshChatSummary
      .mockRejectedValueOnce(
        new ApiClientError(409, 'SUMMARY_IN_PROGRESS', 'busy'),
      )
      .mockResolvedValue(fresh());
    renderPage();
    await vi.waitFor(() =>
      expect(api.refreshChatSummary).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(
      await screen.findByText('The user plans a trip.'),
    ).toBeInTheDocument();
    expect(api.refreshChatSummary).toHaveBeenCalledTimes(2);
  });

  it('shows a hint when stale but idle', async () => {
    const still = fresh({ stale: true, pendingMessages: 2 });
    api.getChatSummary.mockResolvedValue(still);
    api.refreshChatSummary.mockResolvedValue(still);
    renderPage();
    expect(
      await screen.findByText('2 new messages since this summary.'),
    ).toBeInTheDocument();
    expect(api.refreshChatSummary).toHaveBeenCalledTimes(1);
  });

  it('resets summary state when navigating to another chat', async () => {
    const pending = makeSummaryState({ stale: true, pendingMessages: 4 });
    api.getChatSummary.mockResolvedValue(pending);
    api.refreshChatSummary
      .mockResolvedValueOnce({ ...pending, content: 'c1 text' })
      .mockResolvedValueOnce(fresh({ content: 'c2 text' }));
    function Nav() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => void navigate('/chats/c2')}>
          go
        </button>
      );
    }
    renderWithProviders({
      route: '/chats/c1',
      ui: (
        <>
          <Nav />
          <Routes>
            <Route path="/chats/:chatId" element={<AdminChatPage />} />
          </Routes>
        </>
      ),
    });
    expect(await screen.findByText('c1 text')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(await screen.findByText('c2 text')).toBeInTheDocument();
    expect(api.refreshChatSummary).toHaveBeenCalledTimes(2);
  });
});
