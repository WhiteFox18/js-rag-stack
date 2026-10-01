import type { RequestPrincipal } from '../common/models/request-principal';
import type { Prisma, UsageKind } from '../generated/prisma/client';

export type UsageOwner =
  | { type: 'user'; id: string }
  | { type: 'anonymous'; id: string };

export interface OwnerColumns {
  user_id: string | null;
  anonymous_session_id: string | null;
}

export interface RecordUsageParams {
  principal: RequestPrincipal;
  chatId: string | null;
  modelId: string;
  kind: UsageKind;
  inputTokens?: number;
  outputTokens?: number;
}

export interface CreateUsageRecord extends OwnerColumns {
  chat_id: string | null;
  model_id: string;
  kind: UsageKind;
  input_tokens: number;
  output_tokens: number;
}

export interface ReassignAnonymousUsageParams {
  transaction: Prisma.TransactionClient;
  anonymousSessionId: string;
  userId: string;
}

export interface UsageRange {
  from?: Date;
  to?: Date;
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface UsageQueryParams {
  owner: UsageOwner;
  range: UsageRange;
}

export interface UsageRowsParams extends UsageQueryParams {
  page: PageRequest;
}

export interface FindUsageRowsParams {
  where: Prisma.UsageLogWhereInput;
  skip: number;
  take: number;
}

export interface UsageExistsParams {
  ownerColumn: 'user_id' | 'anonymous_session_id';
  alias: string;
}
