import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { ChatShell } from './chat-shell';

const api = vi.hoisted(() => ({
  getReadiness: vi.fn(),
  getMe: vi.fn(),
  refresh: vi.fn(),
  listChats: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signOutAll: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderShell() {
  return renderWithProviders({
    route: '/chats',
    ui: (
      <Routes>
        <Route element={<ChatShell />}>
          <Route path="/chats" element={<p>Chat outlet</p>} />
        </Route>
      </Routes>
    ),
  });
}

describe('ChatShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getReadiness.mockResolvedValue({
      status: 'ready',
      checks: { database: 'up', redis: 'up', ollama: 'up' },
    });
    api.getMe.mockResolvedValue({ user: null });
    api.listChats.mockResolvedValue({ chats: [], nextCursor: null });
  });

  it('collapses the desktop sidebar and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = renderShell();
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' });
    expect(sidebar).not.toHaveClass('md:hidden');

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));
    expect(sidebar).toHaveClass('md:hidden');
    expect(localStorage.getItem('sidebar:collapsed')).toBe('true');
    unmount();

    renderShell();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveClass(
      'md:hidden',
    );
    await user.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect(
      screen.getByRole('complementary', { name: 'Sidebar' }),
    ).not.toHaveClass('md:hidden');
    expect(localStorage.getItem('sidebar:collapsed')).toBeNull();
  });

  it('opens the mobile drawer', async () => {
    renderShell();
    const toggle = screen.getByRole('button', { name: 'Toggle chat history' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveClass(
      'fixed',
    );
  });

  it('keeps the theme toggle reachable when the sidebar is collapsed', async () => {
    const user = userEvent.setup();
    renderShell();
    expect(
      within(screen.getByRole('banner')).queryByRole('group', {
        name: 'Theme',
      }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Hide sidebar' }));

    expect(
      within(screen.getByRole('banner')).getByRole('group', { name: 'Theme' }),
    ).toBeInTheDocument();
  });
});
