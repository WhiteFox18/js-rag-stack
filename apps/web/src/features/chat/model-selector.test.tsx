import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ModelSelector } from './model-selector';

describe('ModelSelector', () => {
  it('lists models and reports changes', async () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[
          { name: 'a', default: true, maxContext: 8192 },
          { name: 'b', default: false, maxContext: 8192 },
        ]}
        value="a"
        unavailableModel={null}
        disabled={false}
        onChange={onChange}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'b');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(
      screen.getByRole('option', { name: 'a (default)' }),
    ).toBeInTheDocument();
  });

  it('shows a degraded state with no models', () => {
    render(
      <ModelSelector
        models={[]}
        value={null}
        unavailableModel={null}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('No models available');
  });

  it('asks the user to switch when the chat model is unavailable', async () => {
    const onChange = vi.fn();
    render(
      <ModelSelector
        models={[{ name: 'a', default: true, maxContext: 8192 }]}
        value="old:1b"
        unavailableModel="old:1b"
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'old:1b is no longer available — choose another model',
    );
    expect(screen.getByLabelText('Model')).toHaveValue('');
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
