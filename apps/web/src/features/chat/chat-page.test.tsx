import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChat, makeMessage } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { ChatPage } from './chat-page';

const api = vi.hoisted(() => ({
  getModels: vi.fn(),
  getChat: vi.fn(),
  createChat: vi.fn(),
  streamMessage: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderPage(route = '/chats') {
  return renderWithProviders({
    route,
    ui: (
      <Routes>
        <Route path="/chats/:chatId?" element={<ChatPage />} />
      </Routes>
    ),
  });
}

describe('ChatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getModels.mockResolvedValue({
      models: [{ name: 'qwen2.5:1.5b', default: true }],
    });
  });

  it('creates a chat and renders streamed deltas, then the authoritative history', async () => {
    api.createChat.mockResolvedValue(makeChat({ id: 'c1' }));
    api.getChat.mockResolvedValue({
      ...makeChat({ id: 'c1' }),
      nextCursor: null,
      messages: [
        makeMessage({ id: 'u', content: 'Hi there' }),
        makeMessage({
          id: 'a',
          role: 'assistant',
          content: 'Hello!',
          model: 'qwen2.5:1.5b',
        }),
      ],
    });
    let release: () => void = () => undefined;
    api.streamMessage.mockImplementation(
      async ({ onEvent }: { onEvent: (e: unknown) => void }) => {
        onEvent({
          event: 'stream.started',
          data: {
            chatId: 'c1',
            userMessageId: 'u',
            assistantMessageId: 'a',
            model: 'qwen2.5:1.5b',
          },
        });
        onEvent({
          event: 'message.delta',
          data: { assistantMessageId: 'a', delta: 'Hel' },
        });
        await new Promise<void>((resolve) => (release = resolve));
      },
    );

    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /qwen2.5:1.5b/ });
    await user.type(screen.getByLabelText('Message'), 'Hi there');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Hel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(api.createChat.mock.calls[0]?.[0]).toMatchObject({
      model: 'qwen2.5:1.5b',
      title: 'Hi there',
    });
    expect(api.streamMessage.mock.calls[0]?.[0]).toMatchObject({
      chatId: 'c1',
      input: { content: 'Hi there', model: 'qwen2.5:1.5b' },
    });

    release();
    expect(await screen.findByText('Hello!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
  });

  it('aborts the request when Stop is pressed', async () => {
    api.createChat.mockResolvedValue(makeChat({ id: 'c1' }));
    api.getChat.mockResolvedValue({
      ...makeChat({ id: 'c1' }),
      nextCursor: null,
      messages: [],
    });
    let signal: AbortSignal | undefined;
    api.streamMessage.mockImplementation(
      ({ signal: s }: { signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          signal = s;
          s.addEventListener('abort', () => resolve());
        }),
    );

    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /qwen2.5:1.5b/ });
    await user.type(screen.getByLabelText('Message'), 'long one');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await user.click(await screen.findByRole('button', { name: 'Stop' }));

    expect(signal?.aborted).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument(),
    );
  });

  it('shows a recoverable error and restores the draft when the stream is rejected', async () => {
    api.createChat.mockResolvedValue(makeChat({ id: 'c1' }));
    api.getChat.mockResolvedValue({
      ...makeChat({ id: 'c1' }),
      nextCursor: null,
      messages: [],
    });
    api.streamMessage.mockRejectedValue(new Error('Model is busy.'));

    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('option', { name: /qwen2.5:1.5b/ });
    await user.type(screen.getByLabelText('Message'), 'retry me');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Model is busy.',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Message')).toHaveValue('retry me'),
    );
  });

  it('pages in earlier messages for an existing chat', async () => {
    api.getChat.mockImplementation((_id: string, params: { cursor?: string }) =>
      Promise.resolve(
        params.cursor
          ? {
              ...makeChat(),
              nextCursor: null,
              messages: [
                makeMessage({ id: 'old', content: 'Earlier message' }),
              ],
            }
          : {
              ...makeChat(),
              nextCursor: 'cursor-1',
              messages: [makeMessage({ id: 'new', content: 'Latest message' })],
            },
      ),
    );

    renderPage('/chats/c1');
    expect(await screen.findByText('Latest message')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Load earlier messages' }),
    );
    expect(await screen.findByText('Earlier message')).toBeInTheDocument();
    expect(api.getChat).toHaveBeenLastCalledWith('c1', { cursor: 'cursor-1' });
  });
});
