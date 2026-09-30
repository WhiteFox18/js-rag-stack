import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getScrollContainer, mockScrollGeometry } from '../../test/dom';
import { makeMessage } from '../../test/fixtures';
import { PENDING_PROMPT_ID } from './chat.helpers';
import type { MessageListProps, PendingStream } from './chat.types';
import { MessageList } from './message-list';
import { useScrollTracking } from './use-scroll-tracking';

function Harness(props: Omit<MessageListProps, 'scroll'>) {
  const scroll = useScrollTracking({ promptIds: [], resetKey: 'test' });
  return <MessageList {...props} scroll={scroll} />;
}

const base = { hasOlder: false, isLoadingOlder: false, onLoadOlder: vi.fn() };

const streaming: PendingStream = {
  chatId: 'c',
  status: 'streaming',
  userContent: 'Live question',
  userMessageId: 'u',
  assistantMessageId: 'a',
  model: 'm',
  assistantText: 'Partial ans',
  errorMessage: null,
};

describe('MessageList', () => {
  it('renders messages with expandable model and token details', () => {
    render(
      <Harness
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

  it('renders assistant replies as markdown and user prompts as wrapped text', async () => {
    render(
      <Harness
        {...base}
        pending={null}
        messages={[
          makeMessage({ id: '1', content: '**not bold** ' + 'x'.repeat(300) }),
          makeMessage({ id: '2', role: 'assistant', content: '**bold**' }),
        ]}
      />,
    );
    expect((await screen.findByText('bold')).tagName).toBe('STRONG');
    const prompt = screen.getByText(/\*\*not bold\*\*/);
    expect(prompt.tagName).toBe('P');
    expect(prompt).toHaveClass('break-words');
  });

  it('shows streamed text and does not duplicate persisted rows', () => {
    render(
      <Harness
        {...base}
        pending={streaming}
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
    expect(screen.getByRole('article', { name: 'Assistant' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows a thinking indicator before the first token', () => {
    render(
      <Harness
        {...base}
        pending={{ ...streaming, assistantText: '' }}
        messages={[]}
      />,
    );
    expect(
      screen.getByRole('status', { name: 'Assistant is thinking' }),
    ).toBeInTheDocument();
  });

  it('marks user prompts as navigation targets, including the pending one', () => {
    render(
      <Harness
        {...base}
        pending={streaming}
        messages={[makeMessage({ id: 'u0', content: 'Earlier' })]}
      />,
    );
    expect(screen.getByText('Earlier').closest('article')).toHaveAttribute(
      'data-prompt-id',
      'u0',
    );
    expect(
      screen.getByText('Live question').closest('article'),
    ).toHaveAttribute('data-prompt-id', PENDING_PROMPT_ID);
  });

  it('offers a jump-to-latest button after the reader scrolls up', async () => {
    render(<Harness {...base} pending={null} messages={[makeMessage()]} />);
    const container = getScrollContainer();
    const geometry = mockScrollGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 100,
    });
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();

    fireEvent.scroll(container);
    await userEvent.click(
      screen.getByRole('button', { name: 'Jump to latest' }),
    );

    expect(geometry.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
  });

  it('loads earlier messages on demand', async () => {
    const onLoadOlder = vi.fn();
    render(
      <Harness
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
