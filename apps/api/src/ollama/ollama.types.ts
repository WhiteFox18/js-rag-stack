export interface OllamaHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OllamaModel {
  name: string;
  default: boolean;
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
