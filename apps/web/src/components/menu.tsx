import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { MenuProps } from './components.types';
import { MoreIcon } from './icons';

export function Menu({ label, items, triggerClassName = '' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const closeAndRefocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const menuItems = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];
    const index = menuItems.findIndex(
      (item) => item === document.activeElement,
    );
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAndRefocus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      menuItems[(index + 1) % menuItems.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      menuItems[(index - 1 + menuItems.length) % menuItems.length]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={triggerClassName}
      >
        <MoreIcon className="size-4" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-1 min-w-36 rounded-lg border border-border bg-bg p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                closeAndRefocus();
                item.onSelect();
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ${
                item.tone === 'danger'
                  ? 'text-danger hover:bg-danger-soft'
                  : 'text-fg hover:bg-surface-2'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
