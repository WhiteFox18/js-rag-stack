import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Delete chat?"
      description="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('opens as a labelled modal with focus on Cancel', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Delete chat?' });
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('confirms and cancels', async () => {
    const { onConfirm, onCancel } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('treats Escape (native cancel event) as cancel', () => {
    const { onCancel } = renderDialog();
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
