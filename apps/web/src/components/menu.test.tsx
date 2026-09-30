import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from './menu';

function mockTriggerRect({ top, bottom }: { top: number; bottom: number }) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top,
    bottom,
    left: 260,
    right: 290,
    width: 30,
    height: bottom - top,
    x: 260,
    y: top,
    toJSON: () => ({}),
  });
}

function renderMenu() {
  render(
    <Menu
      label="Actions"
      items={[
        { label: 'Rename', onSelect: vi.fn() },
        { label: 'Delete', onSelect: vi.fn() },
      ]}
    />,
  );
}

describe('Menu', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens below the trigger when there is room', async () => {
    mockTriggerRect({ top: 100, bottom: 130 });
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    const menu = screen.getByRole('menu');
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.top).toBe('134px');
    expect(menu.style.bottom).toBe('');
  });

  it('opens upward near the bottom of the viewport', async () => {
    mockTriggerRect({
      top: window.innerHeight - 40,
      bottom: window.innerHeight - 10,
    });
    renderMenu();
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    const menu = screen.getByRole('menu');
    expect(menu.style.bottom).toBe('44px');
    expect(menu.style.top).toBe('');
  });

  it('closes on scroll and on resize', async () => {
    mockTriggerRect({ top: 100, bottom: 130 });
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Actions' });
    await userEvent.click(trigger);
    fireEvent.scroll(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent(window, new Event('resize'));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
