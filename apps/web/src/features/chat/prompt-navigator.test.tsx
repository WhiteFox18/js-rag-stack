import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PromptNavigator } from './prompt-navigator';

const prompts = [
  { id: 'a', preview: 'First question' },
  { id: 'b', preview: 'Second question' },
  { id: 'c', preview: 'https://example.com/' + 'x'.repeat(400) },
];

describe('PromptNavigator', () => {
  it('lists prompts in order and marks the active one', () => {
    render(
      <PromptNavigator prompts={prompts} activeId="b" onSelect={vi.fn()} />,
    );
    const nav = screen.getByRole('navigation', {
      name: 'Prompts in this chat',
    });
    const buttons = screen.getAllByRole('button');
    expect(nav).toBeInTheDocument();
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Prompt 1: First question',
      'Prompt 2: Second question',
      `Prompt 3: ${prompts[2]?.preview}`,
    ]);
    expect(buttons[1]).toHaveAttribute('aria-current', 'true');
    expect(buttons[0]).not.toHaveAttribute('aria-current');
  });

  it('truncates long prompts but exposes the full text', () => {
    render(
      <PromptNavigator prompts={prompts} activeId={null} onSelect={vi.fn()} />,
    );
    const long = screen.getByRole('button', { name: /Prompt 3/ });
    expect(long).toHaveClass('truncate');
    expect(long).toHaveAttribute('title', prompts[2]?.preview);
  });

  it('reports the selected prompt', async () => {
    const onSelect = vi.fn();
    render(
      <PromptNavigator prompts={prompts} activeId={null} onSelect={onSelect} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /First question/ }),
    );
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
