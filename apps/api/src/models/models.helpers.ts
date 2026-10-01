import type { AdminModel } from '@js-rag-stack/contracts';
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
