import { ConflictException } from '@nestjs/common';
import { ModelAdministrationService } from '../src/models/model-administration.service';
import { isModelConflict } from '../src/models/models.helpers';

describe('isModelConflict', () => {
  it('maps unique and default-availability check violations', () => {
    expect(isModelConflict({ code: 'P2002' })).toBe(true);
    expect(
      isModelConflict(
        new Error(
          'new row violates check constraint "model_default_is_available_check"',
        ),
      ),
    ).toBe(true);
    expect(isModelConflict(new Error('connection lost'))).toBe(false);
  });
});

describe('ModelAdministrationService.update conflicts', () => {
  const model = {
    id: 'm1',
    name: 'm',
    max_context: 4096,
    is_available: true,
    is_default: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  function service(failure: unknown) {
    return new ModelAdministrationService(
      {
        findById: () => Promise.resolve(model),
        updateWithDefault: () => Promise.reject(failure as Error),
      } as never,
      { listInstalledModels: () => Promise.resolve([]) } as never,
    );
  }

  it('turns a check-constraint violation into a 409', async () => {
    await expect(
      service(
        new Error(
          'violates check constraint "model_default_is_available_check"',
        ),
      ).update({ id: 'm1', input: { isDefault: true } }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows unrelated failures', async () => {
    await expect(
      service(new Error('boom')).update({
        id: 'm1',
        input: { maxContext: 2048 },
      }),
    ).rejects.toThrow('boom');
  });
});
