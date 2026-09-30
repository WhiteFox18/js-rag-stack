import type { ChatMessage, ChatSummary } from '@js-rag-stack/contracts';

export function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    status: 'completed',
    content: 'Hello',
    model: null,
    tokenCount: null,
    tokenCountSource: 'unknown',
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    finishReason: null,
    createdAt: '2026-09-30T10:00:00.000Z',
    updatedAt: '2026-09-30T10:00:00.000Z',
    ...overrides,
  };
}

export function makeChat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: 'c1',
    title: 'First chat',
    selectedModel: 'qwen2.5:1.5b',
    archivedAt: null,
    createdAt: '2026-09-30T10:00:00.000Z',
    updatedAt: '2026-09-30T10:00:00.000Z',
    lastMessageAt: '2026-09-30T10:00:00.000Z',
    ...overrides,
  };
}
