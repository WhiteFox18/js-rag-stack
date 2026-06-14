import type { ChatMessage, ChatSummary } from '@js-rag-stack/contracts';
import type { Chat, Message } from '../generated/prisma/client';
import type { RequestPrincipal } from '../common/models/request-principal';
import { HttpException } from '@nestjs/common';

export function getOwnerFilter(
  principal: RequestPrincipal,
): { user_id: string } | { anonymous_session_id: string } {
  return principal.type === 'authenticated'
    ? { user_id: principal.user_id }
    : { anonymous_session_id: principal.anonymous_session_id };
}

export function getPrincipalLockId(principal: RequestPrincipal): string {
  return principal.type === 'authenticated'
    ? `user:${principal.user_id}`
    : `anonymous:${principal.anonymous_session_id}`;
}

export function estimateTokenCount(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

export function deriveChatTitle(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 80) || 'New chat';
}

export function toChatSummary(chat: Chat): ChatSummary {
  return {
    id: chat.id,
    title: chat.title,
    selectedModel: chat.selected_model,
    archivedAt: chat.archived_at?.toISOString() ?? null,
    createdAt: chat.created_at.toISOString(),
    updatedAt: chat.updated_at.toISOString(),
    lastMessageAt: chat.last_message_at.toISOString(),
  };
}

export function toChatMessage(message: Message): ChatMessage {
  return {
    id: message.id,
    role: message.role.toLowerCase() as ChatMessage['role'],
    status: message.status.toLowerCase() as ChatMessage['status'],
    content: message.content,
    model: message.model,
    tokenCount: message.token_count,
    tokenCountSource:
      message.token_count_source.toLowerCase() as ChatMessage['tokenCountSource'],
    promptTokens: message.prompt_tokens,
    completionTokens: message.completion_tokens,
    totalTokens: message.total_tokens,
    finishReason: message.finish_reason,
    createdAt: message.created_at.toISOString(),
    updatedAt: message.updated_at.toISOString(),
  };
}

export function getPublicStreamError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const code =
      status === 404
        ? 'CHAT_NOT_FOUND'
        : status === 409
          ? 'GENERATION_CONFLICT'
          : status === 413
            ? 'INPUT_TOO_LARGE'
            : 'BAD_REQUEST';
    return { code, message: error.message };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : 'The generation failed.';
    return { code: error.code, message };
  }

  return {
    code: 'GENERATION_FAILED',
    message: 'The generation failed.',
  };
}
