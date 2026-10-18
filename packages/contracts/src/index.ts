export interface HealthResponse {
  status: 'ok';
  service: 'api';
  timestamp: string;
  uptimeSeconds: number;
}

export type StreamEventName =
  | 'stream.started'
  | 'message.delta'
  | 'message.completed'
  | 'context.summarizing'
  | 'context.updated'
  | 'stream.error'
  | 'stream.cancelled'
  | 'heartbeat';

export interface ModelInfo {
  name: string;
  default: boolean;
  maxContext: number;
}

export interface ModelsResponse {
  models: ModelInfo[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  status: 'streaming' | 'completed' | 'failed' | 'cancelled';
  content: string;
  model: string | null;
  tokenCount: number | null;
  tokenCountSource: 'ollama_reported' | 'estimated' | 'unknown';
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  finishReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  selectedModel: string;
  selectedModelAvailable: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
}

export interface ChatContext {
  usedTokens: number | null;
  maxTokens: number;
  summary: string | null;
  summarizedThroughMessageId: string | null;
}

export interface StreamStartedEvent {
  chatId: string;
  userMessageId: string;
  assistantMessageId: string;
  model: string;
}

export interface MessageDeltaEvent {
  assistantMessageId: string;
  delta: string;
}

export interface MessageCompletedEvent {
  message: ChatMessage;
}

export interface StreamErrorEvent {
  code: string;
  message: string;
}

export interface StreamCancelledEvent {
  assistantMessageId: string;
  status: 'cancelled';
}

export type ChatStreamEvent =
  | { event: 'stream.started'; data: StreamStartedEvent }
  | { event: 'message.delta'; data: MessageDeltaEvent }
  | { event: 'message.completed'; data: MessageCompletedEvent }
  | { event: 'context.summarizing'; data: Record<string, never> }
  | { event: 'context.updated'; data: ChatContext }
  | { event: 'stream.error'; data: StreamErrorEvent }
  | { event: 'stream.cancelled'; data: StreamCancelledEvent }
  | { event: 'heartbeat'; data: Record<string, never> };

export interface AdminModel {
  id: string;
  name: string;
  maxContext: number;
  isAvailable: boolean;
  isDefault: boolean;
  installed: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminModelsResponse {
  models: AdminModel[];
}

export interface CreateModelInput {
  name: string;
  maxContext: number;
  isAvailable?: boolean;
}

export interface UpdateModelInput {
  maxContext?: number;
  isAvailable?: boolean;
  isDefault?: boolean;
}

export interface AdminProfile {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AdminAuthResponse {
  admin: AdminProfile;
}

export interface AdminSignInInput {
  email: string;
  password: string;
}

export type UsageKind = 'chat' | 'summary' | 'admin_summary';

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  lastActivityAt: string | null;
}

export interface UsageBreakdownItem {
  model: string;
  kind: UsageKind;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageRow {
  id: string;
  createdAt: string;
  model: string;
  kind: UsageKind;
  inputTokens: number;
  outputTokens: number;
  chatId: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type AdminUserSort = 'lastActivity' | 'totalTokens' | 'createdAt';

export interface UsageRangeQuery {
  from?: string;
  to?: string;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  usage: UsageTotals;
}

export interface AdminUserDetail {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
  };
  usage: UsageTotals;
  breakdown: UsageBreakdownItem[];
}

export interface AdminAnonymousListItem {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  chatCount: number;
  usage: UsageTotals;
}

export interface AdminAnonymousDetail {
  session: {
    id: string;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
    chatCount: number;
  };
  usage: UsageTotals;
  breakdown: UsageBreakdownItem[];
}
