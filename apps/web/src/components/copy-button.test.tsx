import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './copy-button';

describe('CopyButton', () => {
  afterEach(() => vi.useRealTimers());

  it('copies the text, confirms, then resets', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CopyButton text="hello" label="Copy message" />);

    await user.click(screen.getByRole('button', { name: 'Copy message' }));

    expect(await navigator.clipboard.readText()).toBe('hello');
    expect(
      await screen.findByRole('button', { name: 'Copied' }),
    ).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(
      screen.getByRole('button', { name: 'Copy message' }),
    ).toBeInTheDocument();
  });

  it('reports failure instead of throwing when the clipboard is unavailable', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(
      new Error('denied'),
    );
    render(<CopyButton text="hello" />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(
      await screen.findByRole('button', { name: 'Copy failed' }),
    ).toBeInTheDocument();
  });
});
