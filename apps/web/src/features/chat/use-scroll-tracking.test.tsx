import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockScrollGeometry,
  triggerIntersection,
  triggerResize,
} from '../../test/dom';
import { useScrollTracking } from './use-scroll-tracking';

const PROMPTS = ['p1', 'p2', 'p3'];

function Harness({ resetKey = 'chat-a' }: { resetKey?: string }) {
  const scroll = useScrollTracking({ promptIds: PROMPTS, resetKey });
  const { containerRef, contentRef } = scroll;
  return (
    <>
      <p data-testid="active">{scroll.activePromptId ?? 'none'}</p>
      <p data-testid="overflowing">{String(scroll.isOverflowing)}</p>
      <p data-testid="at-bottom">{String(scroll.isAtBottom)}</p>
      <button type="button" onClick={() => scroll.scrollToPrompt('p3')}>
        go p3
      </button>
      <button type="button" onClick={scroll.scrollToBottom}>
        bottom
      </button>
      <button type="button" onClick={scroll.preserveScrollPosition}>
        preserve
      </button>
      <div ref={containerRef} data-testid="container">
        <div ref={contentRef}>
          {PROMPTS.map((id) => (
            <article key={id} data-prompt-id={id} tabIndex={-1}>
              {id}
            </article>
          ))}
        </div>
      </div>
    </>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const prompt = (id: string) => screen.getByText(id, { selector: 'article' });

describe('useScrollTracking', () => {
  afterEach(() => vi.useRealTimers());

  it('reports overflow only when content is taller than the container', () => {
    render(<Harness />);
    const geometry = mockScrollGeometry(screen.getByTestId('container'), {
      scrollHeight: 400,
      clientHeight: 500,
    });
    triggerResize();
    expect(text('overflowing')).toBe('false');

    geometry.scrollHeight = 1200;
    triggerResize();
    expect(text('overflowing')).toBe('true');
  });

  it('follows new content while pinned, but not after the reader scrolls up', () => {
    render(<Harness />);
    const container = screen.getByTestId('container');
    const geometry = mockScrollGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 500,
    });
    triggerResize();
    expect(geometry.scrollTop).toBe(1000);

    geometry.scrollTop = 100;
    fireEvent.scroll(container);
    expect(text('at-bottom')).toBe('false');
    geometry.scrollHeight = 1400;
    triggerResize();
    expect(geometry.scrollTop).toBe(100);

    fireEvent.click(screen.getByRole('button', { name: 'bottom' }));
    expect(text('at-bottom')).toBe('true');
    expect(geometry.scrollTop).toBe(1400);
  });

  it('tracks the active prompt as prompts cross the top band', () => {
    render(<Harness />);
    triggerIntersection(prompt('p2'), { isIntersecting: true });
    expect(text('active')).toBe('p2');

    triggerIntersection(prompt('p2'), {
      isIntersecting: false,
      top: 900,
      rootBottom: 300,
    });
    expect(text('active')).toBe('p1');
  });

  it('locks the selected prompt while scrolling to it and focuses it', () => {
    vi.useFakeTimers();
    render(<Harness />);
    triggerIntersection(prompt('p1'), { isIntersecting: true });

    fireEvent.click(screen.getByRole('button', { name: 'go p3' }));
    expect(text('active')).toBe('p3');
    expect(document.activeElement).toBe(prompt('p3'));

    triggerIntersection(prompt('p2'), { isIntersecting: true });
    expect(text('active')).toBe('p3');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(text('active')).toBe('p2');
  });

  it('keeps the reading position when older content is prepended', () => {
    render(<Harness />);
    const container = screen.getByTestId('container');
    const geometry = mockScrollGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 100,
    });
    fireEvent.scroll(container);

    fireEvent.click(screen.getByRole('button', { name: 'preserve' }));
    geometry.scrollHeight = 1600;
    triggerResize();

    expect(geometry.scrollTop).toBe(700);
  });

  it('resets pinning and highlight when the conversation changes', () => {
    const { rerender } = render(<Harness resetKey="chat-a" />);
    const container = screen.getByTestId('container');
    const geometry = mockScrollGeometry(container, {
      scrollHeight: 1000,
      clientHeight: 500,
      scrollTop: 100,
    });
    triggerIntersection(prompt('p2'), { isIntersecting: true });
    fireEvent.scroll(container);
    expect(text('at-bottom')).toBe('false');

    rerender(<Harness resetKey="chat-b" />);
    expect(text('active')).toBe('none');
    expect(text('at-bottom')).toBe('true');

    geometry.scrollHeight = 1300;
    triggerResize();
    expect(geometry.scrollTop).toBe(1300);
  });
});
