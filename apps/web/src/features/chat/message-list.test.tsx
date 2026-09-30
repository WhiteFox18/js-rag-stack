import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeMessage } from '../../test/fixtures';
import { MessageList } from './message-list';
import type { PendingStream } from './chat.types';

const base = { hasOlder: false, isLoadingOlder: false, onLoadOlder: vi.fn() };

describe('MessageList', () => {
  it('renders messages with expandable model and token details', () => {
    render(
      <MessageList
        {...base}
        pending={null}
        messages={[
          makeMessage({ id: '1', content: 'Question' }),
          makeMessage({
            id: '2',
            role: 'assistant',
            content: 'Answer',
            model: 'qwen2.5:1.5b',
            completionTokens: 7,
            status: 'cancelled',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Question')).toBeInTheDocument();
    expect(screen.getByText('Model: qwen2.5:1.5b')).toBeInTheDocument();
    expect(screen.getByText('Completion tokens: 7')).toBeInTheDocument();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('shows streamed text and does not duplicate persisted rows', () => {
    const pending: PendingStream = {
      chatId: 'c',
      status: 'streaming',
      userContent: 'Live question',
      userMessageId: 'u',
      assistantMessageId: 'a',
      model: 'm',
      assistantText: 'Partial ans',
      errorMessage: null,
    };
    render(
      <MessageList
        {...base}
        pending={pending}
        messages={[
          makeMessage({ id: 'u', content: 'Live question' }),
          makeMessage({
            id: 'a',
            role: 'assistant',
            content: '',
            status: 'streaming',
          }),
        ]}
      />,
    );
    expect(screen.getAllByText('Live question')).toHaveLength(1);
    expect(screen.getByText('Partial ans')).toBeInTheDocument();
  });

  it('loads earlier messages on demand', async () => {
    const onLoadOlder = vi.fn();
    render(
      <MessageList
        messages={[]}
        pending={null}
        hasOlder
        isLoadingOlder={false}
        onLoadOlder={onLoadOlder}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Load earlier messages' }),
    );
    expect(onLoadOlder).toHaveBeenCalledOnce();
  });
});
