import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import type { MenuProps } from './components.types';
import { MoreIcon } from './icons';

const ITEM_HEIGHT_PX = 36;
const MENU_PADDING_PX = 8;
const GAP_PX = 4;

function placeMenu({
  trigger,
  itemCount,
}: {
  trigger: DOMRect;
  itemCount: number;
}): CSSProperties {
  const height = itemCount * ITEM_HEIGHT_PX + MENU_PADDING_PX;
  const right = window.innerWidth - trigger.right;
  const fitsBelow = trigger.bottom + GAP_PX + height <= window.innerHeight;
  return fitsBelow
    ? { position: 'fixed', right, top: trigger.bottom + GAP_PX }
    : {
        position: 'fixed',
        right,
        bottom: window.innerHeight - trigger.top + GAP_PX,
      };
}

export function Menu({ label, items, triggerClassName = '' }: MenuProps) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const open = position !== null;
  const setOpen = (next: boolean) => {
    if (!next) setPosition(null);
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    // A fixed menu would drift from its trigger, so close it instead.
    const close = (event: Event) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      ) {
        return;
      }
      setPosition(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
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
        onClick={(event) => {
          if (open) {
            setPosition(null);
            return;
          }
          setPosition(
            placeMenu({
              trigger: event.currentTarget.getBoundingClientRect(),
              itemCount: items.length,
            }),
          );
        }}
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
          style={position}
          className="z-50 min-w-36 rounded-lg border border-border bg-bg p-1 shadow-lg"
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
