import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChat } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { ChatSidebar } from './chat-sidebar';

const api = vi.hoisted(() => ({
  listChats: vi.fn(),
  updateChat: vi.fn(),
  deleteChat: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signOutAll: vi.fn(),
}));

vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

function renderSidebar() {
  return renderWithProviders({
    route: '/chats/c1',
    ui: (
      <ChatSidebar
        user={null}
        activeChatId="c1"
        onNavigate={vi.fn()}
        onSignIn={vi.fn()}
        onSignUp={vi.fn()}
      />
    ),
  });
}

async function openActions() {
  const user = userEvent.setup();
  renderSidebar();
  await screen.findByRole('link', { name: 'First chat' });
  const trigger = screen.getByRole('button', {
    name: 'Actions for First chat',
  });
  await user.click(trigger);
  return { user, trigger };
}

describe('ChatSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listChats.mockResolvedValue({ chats: [makeChat()], nextCursor: null });
    api.updateChat.mockResolvedValue(makeChat({ title: 'Renamed' }));
    api.deleteChat.mockResolvedValue(undefined);
  });

  it('opens an actions menu with keyboard support', async () => {
    const { user, trigger } = await openActions();
    const rename = screen.getByRole('menuitem', { name: 'Rename' });
    expect(rename).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('renames a chat from the menu', async () => {
    const { user } = await openActions();
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const input = screen.getByLabelText('Chat title');
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, 'Renamed{Enter}');
    await waitFor(() =>
      expect(api.updateChat).toHaveBeenCalledWith('c1', { title: 'Renamed' }),
    );
  });

  it('asks for confirmation before deleting', async () => {
    const { user } = await openActions();
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    let dialog = await screen.findByRole('dialog', { name: 'Delete chat?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.deleteChat).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Actions for First chat' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    dialog = await screen.findByRole('dialog', { name: 'Delete chat?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.deleteChat).toHaveBeenCalledWith('c1'));
  });
});
