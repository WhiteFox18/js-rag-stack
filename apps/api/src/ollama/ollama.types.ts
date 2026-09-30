export interface OllamaHistoryMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaModel {
  name: string;
  default: boolean;
  maxContext: number;
}

export interface OllamaChatChunk {
  delta: string;
  done: boolean;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
}

export interface StreamOllamaChatParams {
  model: string;
  messages: OllamaHistoryMessage[];
  contextTokens: number;
  signal?: AbortSignal;
}

export interface CompleteOllamaChatParams extends StreamOllamaChatParams {
  maxTokens: number;
}

export interface OllamaCompletion {
  content: string;
  promptTokens?: number;
  completionTokens?: number;
}

export interface OllamaRequestParams {
  model: string;
  messages: OllamaHistoryMessage[];
  options: { num_ctx: number; num_predict?: number };
  signal?: AbortSignal;
}

export interface OllamaTagsResponse {
  models?: Array<{ name?: unknown; model?: unknown }>;
}

export interface OllamaChatResponse {
  message?: { content?: unknown };
  done?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  done_reason?: unknown;
  error?: unknown;
}
