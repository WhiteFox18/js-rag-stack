import { useEffect, useId, useRef } from 'react';
import type { ConfirmDialogProps } from './components.types';

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Closing restores focus to the element that was focused before opening.
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-full max-w-sm rounded-2xl border border-border bg-bg p-6 text-fg shadow-2xl backdrop:bg-black/50"
    >
      <h2 id={titleId} className="text-base font-semibold">
        {title}
      </h2>
      <p id={descriptionId} className="mt-2 text-sm text-fg-muted">
        {description}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-bg hover:opacity-90"
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
