import type { UpdateModelInput } from '@js-rag-stack/contracts';
import type { Model } from '../generated/prisma/client';

export interface CreateModelRecord {
  name: string;
  max_context: number;
  is_available: boolean;
}

export interface UpdateModelRecord {
  max_context?: number;
  is_available?: boolean;
}

export interface SeedDefaultModelParams {
  name: string;
  maxContext: number;
}

export interface UpdateModelRecordParams {
  id: string;
  data: UpdateModelRecord;
}

export interface UpdateModelWithDefaultParams extends UpdateModelRecordParams {
  makeDefault: boolean;
}

export interface UpdateModelParams {
  id: string;
  input: UpdateModelInput;
}

export interface ToAdminModelParams {
  model: Model;
  installed: Set<string> | null;
}
