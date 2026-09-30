import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './composer';

describe('Composer', () => {
  beforeEach(() => localStorage.clear());

  it('sends on Enter, clears the field, and keeps Shift+Enter for new lines', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(true);
    render(
      <Composer
        draftKey="d"
        isBusy={false}
        disabled={false}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Message');
    await user.type(input, 'line1{Shift>}{Enter}{/Shift}line2');
    expect(onSend).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('line1\nline2');
    expect(input).toHaveValue('');
  });

  it('restores the text when the send is not accepted', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(false);
    render(
      <Composer
        draftKey="d"
        isBusy={false}
        disabled={false}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Message'), 'hello');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByLabelText('Message')).toHaveValue('hello');
  });

  it('persists drafts locally and offers Stop while busy', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    const { unmount } = render(
      <Composer
        draftKey="d"
        isBusy={false}
        disabled={false}
        onSend={vi.fn()}
        onStop={onStop}
      />,
    );
    await user.type(screen.getByLabelText('Message'), 'draft');
    unmount();

    render(
      <Composer
        draftKey="d"
        isBusy
        disabled={false}
        onSend={vi.fn()}
        onStop={onStop}
      />,
    );
    expect(screen.getByLabelText('Message')).toHaveValue('draft');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledOnce();
  });
});
