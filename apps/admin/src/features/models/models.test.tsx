import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError } from '@js-rag-stack/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeModel } from '../../test/fixtures';
import { renderWithProviders } from '../../test/render';
import { ModelsPage } from './models-page';

const api = vi.hoisted(() => ({
  listModels: vi.fn(),
  createModel: vi.fn(),
  updateModel: vi.fn(),
}));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  api,
}));

const qwen = makeModel();
const llama = makeModel({
  id: 'm2',
  name: 'llama3.2:3b',
  isDefault: false,
  installed: false,
});

function row(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) });
}

describe('ModelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listModels.mockResolvedValue({ models: [qwen, llama] });
  });

  it('lists models with status', async () => {
    renderWithProviders({ ui: <ModelsPage /> });
    await screen.findByRole('table', { name: 'Models' });
    expect(within(row('qwen2.5')).getByText('Default')).toBeInTheDocument();
    expect(
      within(row('llama3.2')).getByText('Not installed'),
    ).toBeInTheDocument();
    expect(
      within(row('qwen2.5')).getByRole('checkbox', { name: 'Available' }),
    ).toBeDisabled();
  });

  it('adds a model', async () => {
    api.createModel.mockResolvedValue(
      makeModel({ id: 'm3', name: 'phi4:14b', isDefault: false }),
    );
    renderWithProviders({ ui: <ModelsPage /> });
    await screen.findByRole('table', { name: 'Models' });
    await userEvent.type(screen.getByLabelText('Model name'), 'phi4:14b');
    await userEvent.clear(screen.getByLabelText('Max context'));
    await userEvent.type(screen.getByLabelText('Max context'), '16384');
    await userEvent.click(screen.getByRole('button', { name: 'Add model' }));
    expect(api.createModel).toHaveBeenCalledWith({
      name: 'phi4:14b',
      maxContext: 16384,
    });
    expect(api.listModels).toHaveBeenCalledTimes(2);
  });

  it('toggles availability, sets default, and edits max context', async () => {
    api.updateModel.mockResolvedValue(llama);
    renderWithProviders({ ui: <ModelsPage /> });
    await screen.findByRole('table', { name: 'Models' });
    await userEvent.click(
      within(row('llama3.2')).getByRole('checkbox', { name: 'Available' }),
    );
    expect(api.updateModel).toHaveBeenCalledWith('m2', { isAvailable: false });
    await userEvent.click(
      within(row('llama3.2')).getByRole('button', { name: 'Make default' }),
    );
    expect(api.updateModel).toHaveBeenCalledWith('m2', { isDefault: true });
    const context = within(row('llama3.2')).getByRole('spinbutton', {
      name: 'Max context',
    });
    await userEvent.clear(context);
    await userEvent.type(context, '4096{Enter}');
    await userEvent.tab();
    expect(api.updateModel).toHaveBeenCalledWith('m2', { maxContext: 4096 });
    const contextCalls = api.updateModel.mock.calls.filter(
      ([, input]) => 'maxContext' in input,
    );
    expect(contextCalls).toHaveLength(1);
  });

  it('shows server conflicts inline', async () => {
    api.updateModel.mockRejectedValue(
      new ApiClientError(
        409,
        'CONFLICT',
        'Make the model available before setting it as default.',
      ),
    );
    renderWithProviders({ ui: <ModelsPage /> });
    await screen.findByRole('table', { name: 'Models' });
    await userEvent.click(
      within(row('llama3.2')).getByRole('button', { name: 'Make default' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Make the model available before setting it as default.',
    );
  });
});
