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
  | 'stream.error'
  | 'stream.cancelled'
  | 'heartbeat';

export interface ModelInfo {
  name: string;
  default: boolean;
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
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
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
  | { event: 'stream.error'; data: StreamErrorEvent }
  | { event: 'stream.cancelled'; data: StreamCancelledEvent }
  | { event: 'heartbeat'; data: Record<string, never> };
