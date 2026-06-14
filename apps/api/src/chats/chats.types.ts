import type {
  ChatMessage,
  ChatStreamEvent,
  ChatSummary,
} from '@js-rag-stack/contracts';
import type { RequestPrincipal } from '../common/models/request-principal';
import type { Chat, Message } from '../generated/prisma/client';
import type { RedisService } from '../redis/redis.service';

export type ChatHistoryEntry =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; model: string };

export interface FindOwnedChatParams {
  chatId: string;
  principal: RequestPrincipal;
}

export interface AppendChatHistoryParams {
  chatId: string;
  entry: ChatHistoryEntry;
}

export interface WriteChatCacheParams {
  chatId: string;
  history: ChatHistoryEntry[];
}

export interface AcquireRedisLockParams {
  key: string;
  ttlMs?: number;
}

export interface RedisLockParams {
  redis: RedisService;
  key: string;
  token: string;
}

export interface AcquirePrincipalGenerationLockParams {
  principal: RequestPrincipal;
  slots: number;
}

export interface CreateChatParams {
  principal: RequestPrincipal;
  title: string;
  selectedModel: string;
  firstPrompt?: string;
}

export interface ListChatsParams {
  principal: RequestPrincipal;
  cursor?: string;
  limit: number;
  includeArchived: boolean;
}

export interface ListMessagesParams extends FindOwnedChatParams {
  cursor?: string;
  limit: number;
}

export interface UpdateChatParams extends FindOwnedChatParams {
  title?: string;
  selectedModel?: string;
  archived?: boolean;
}

export interface BeginGenerationParams {
  chatId: string;
  content: string;
  model: string;
}

export interface CompleteGenerationParams {
  assistantMessageId: string;
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  finishReason?: string;
}

export interface EndGenerationParams {
  assistantMessageId: string;
  content: string;
  errorCode?: string;
}

export interface StreamChatParams extends FindOwnedChatParams {
  content: string;
  model?: string;
  signal: AbortSignal;
  emit: (event: ChatStreamEvent) => void;
}

export interface ChatPage {
  chats: ChatSummary[];
  nextCursor: string | null;
}

export interface ChatDetail extends ChatSummary {
  messages: ChatMessage[];
  nextCursor: string | null;
}

export interface GenerationMessages {
  userMessage: Message;
  assistantMessage: Message;
}

export interface MapChatDetailParams {
  chat: Chat;
  messages: Message[];
  nextCursor: string | null;
}
