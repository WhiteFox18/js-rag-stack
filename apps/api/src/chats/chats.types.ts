import type { RequestPrincipal } from '../common/models/request-principal';
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
