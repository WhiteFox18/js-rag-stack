import type { AdminModel } from '@js-rag-stack/contracts';
import { getErrorMessage, isUniqueViolation } from '../common/utils/error';
import type { ToAdminModelParams } from './models.types';

export function toAdminModel({
  model,
  installed,
}: ToAdminModelParams): AdminModel {
  return {
    id: model.id,
    name: model.name,
    maxContext: model.max_context,
    isAvailable: model.is_available,
    isDefault: model.is_default,
    installed: installed ? installed.has(model.name) : null,
    createdAt: model.created_at.toISOString(),
    updatedAt: model.updated_at.toISOString(),
  };
}

// A concurrent default switch/disable trips either the partial unique index
// or the default-is-available check; both are client-visible conflicts.
export function isModelConflict(error: unknown): boolean {
  return (
    isUniqueViolation(error) ||
    getErrorMessage(error).includes('model_default_is_available_check')
  );
}
