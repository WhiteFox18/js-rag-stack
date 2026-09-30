import type {
  ChatContext,
  ChatMessage,
  ChatStreamEvent,
  ChatSummary,
} from '@js-rag-stack/contracts';
import type { RequestPrincipal } from '../common/models/request-principal';
import type {
  ConversationSummary,
  Message,
  Prisma,
} from '../generated/prisma/client';
import type { RedisService } from '../redis/redis.service';

export type ChatWithModel = Prisma.ChatGetPayload<{
  include: { selected_model: true };
}>;

export interface CreateChatRecordParams {
  principal: RequestPrincipal;
  title: string;
  selectedModelId: string;
  firstPrompt?: string;
}

export interface UpdateChatRecordParams {
  chatId: string;
  title?: string;
  selectedModelId?: string;
  archived?: boolean;
}

export type ChatHistoryEntry =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string; model: string };

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
  context: ChatContext;
}

export interface GenerationMessages {
  userMessage: Message;
  assistantMessage: Message;
}

export interface MapChatDetailParams {
  chat: ChatWithModel;
  messages: Message[];
  nextCursor: string | null;
}

export interface UpsertConversationSummaryParams {
  chatId: string;
  content: string;
  summarizedThroughMessageId: string;
  tokenCount: number;
}

export interface ToChatContextParams {
  maxTokens: number;
  summary: ConversationSummary | null;
  lastAssistantMessage: Message | null;
}

export interface ContextSettings {
  summarizeAtRatio: number;
  targetRatio: number;
  keepRecentMessages: number;
  charsPerToken: number;
  summaryMaxRatio: number;
}

export interface ContextBudget {
  trigger: number;
  target: number;
  summaryMaxTokens: number;
  chunkTokens: number;
}

export interface PromptEstimateParams {
  summary: string | null;
  turns: ChatHistoryEntry[];
  content: string;
  charsPerToken: number;
}

export interface NeedsSummarizationParams {
  estimate: number;
  lastReportedTokens: number | null;
  contentTokens: number;
  trigger: number;
}

export interface SelectTurnsToFoldParams {
  turns: ChatHistoryEntry[];
  content: string;
  keepRecent: number;
  target: number;
  summaryTokens: number;
  charsPerToken: number;
}

export interface ChunkEntriesParams {
  entries: ChatHistoryEntry[];
  budget: number;
  charsPerToken: number;
}

export interface SummaryRequestParams {
  previousSummary: string | null;
  entries: ChatHistoryEntry[];
  maxEntryChars: number;
}

export interface PromptMessagesParams {
  summary: string | null;
  turns: ChatHistoryEntry[];
  content: string;
}
