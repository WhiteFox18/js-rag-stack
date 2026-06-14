import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { AppEnvironment } from '../config/environment.schema';
import { getErrorMessage } from '../common/utils/error';
import { RedisService } from '../redis/redis.service';
import { RedisLockService } from './redis-lock.service';
import { ChatsRepository } from './chats.repository';
import type {
  AppendChatHistoryParams,
  ChatHistoryEntry,
  WriteChatCacheParams,
} from './chats.types';

const history_entry_schema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string() }),
  z.object({
    role: z.literal('assistant'),
    content: z.string(),
    model: z.string().min(1),
  }),
]);
const history_schema = z.array(history_entry_schema);

@Injectable()
export class ChatHistoryService {
  private readonly logger = new Logger(ChatHistoryService.name);
  private readonly ttl_seconds: number;

  constructor(
    private readonly repository: ChatsRepository,
    private readonly redis: RedisService,
    private readonly locks: RedisLockService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.ttl_seconds = config.get('REDIS_CHAT_TTL_SECONDS', { infer: true });
  }

  async getHistory(chat_id: string): Promise<ChatHistoryEntry[]> {
    try {
      const cached = await this.redis.get(chat_id);

      if (cached !== null) {
        const parsed = history_schema.safeParse(JSON.parse(cached));

        if (parsed.success) {
          return parsed.data;
        }

        await this.invalidate(chat_id);
      }
    } catch (error) {
      this.logger.warn(
        `History cache read failed for chat ${chat_id}: ${getErrorMessage(error)}`,
      );
    }

    const history = await this.loadFromDatabase(chat_id);
    await this.writeCache({ chatId: chat_id, history });
    return history;
  }

  async append({ chatId, entry }: AppendChatHistoryParams): Promise<void> {
    let lock;

    try {
      lock = await this.locks.acquire({
        key: `history-lock:${chatId}`,
        ttlMs: 5_000,
      });
    } catch (error) {
      this.logger.warn(
        `History cache lock failed for chat ${chatId}: ${getErrorMessage(error)}`,
      );
      return;
    }

    if (!lock) {
      this.logger.warn(
        `History cache update skipped because chat ${chatId} is locked.`,
      );
      return;
    }

    try {
      const history = await this.getHistory(chatId);
      await this.writeCache({ chatId, history: [...history, entry] });
    } finally {
      try {
        await lock.release();
      } catch (error) {
        this.logger.warn(
          `History cache lock release failed for chat ${chatId}: ${getErrorMessage(error)}`,
        );
      }
    }
  }

  async invalidate(chat_id: string): Promise<void> {
    try {
      await this.redis.delete(chat_id);
    } catch (error) {
      this.logger.warn(
        `History cache invalidation failed for chat ${chat_id}: ${getErrorMessage(error)}`,
      );
    }
  }

  async refresh(chat_id: string): Promise<void> {
    const history = await this.loadFromDatabase(chat_id);
    await this.writeCache({ chatId: chat_id, history });
  }

  private async loadFromDatabase(chat_id: string): Promise<ChatHistoryEntry[]> {
    const messages = await this.repository.findCompletedMessages(chat_id);

    return messages.map((message) => {
      if (message.role === 'USER') {
        return { role: 'user' as const, content: message.content };
      }

      if (!message.model) {
        throw new Error(`Assistant message ${message.id} has no model.`);
      }

      return {
        role: 'assistant' as const,
        content: message.content,
        model: message.model,
      };
    });
  }

  private async writeCache({
    chatId,
    history,
  }: WriteChatCacheParams): Promise<void> {
    try {
      await this.redis.setWithTtl({
        key: chatId,
        value: JSON.stringify(history),
        ttlSeconds: this.ttl_seconds,
      });
    } catch (error) {
      this.logger.warn(
        `History cache write failed for chat ${chatId}: ${getErrorMessage(error)}`,
      );
    }
  }
}
