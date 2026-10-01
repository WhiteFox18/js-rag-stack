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
