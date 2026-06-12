import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { AppEnvironment } from '../config/environment.schema';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RedisLockService } from './redis-lock.service';

const history_entry_schema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.string() }),
  z.object({
    role: z.literal('assistant'),
    content: z.string(),
    model: z.string().min(1),
  }),
]);
const history_schema = z.array(history_entry_schema);

export type ChatHistoryEntry = z.infer<typeof history_entry_schema>;

@Injectable()
export class ChatHistoryService {
  private readonly logger = new Logger(ChatHistoryService.name);
  private readonly ttl_seconds: number;

  constructor(
    private readonly prisma: PrismaService,
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
    await this.writeCache(chat_id, history);
    return history;
  }

  async append(chat_id: string, entry: ChatHistoryEntry): Promise<void> {
    let lock;

    try {
      lock = await this.locks.acquire(`history-lock:${chat_id}`, 5_000);
    } catch (error) {
      this.logger.warn(
        `History cache lock failed for chat ${chat_id}: ${getErrorMessage(error)}`,
      );
      return;
    }

    if (!lock) {
      throw new ServiceUnavailableException(
        'Chat history cache is currently being updated.',
      );
    }

    try {
      const history = await this.getHistory(chat_id);
      await this.writeCache(chat_id, [...history, entry]);
    } finally {
      try {
        await lock.release();
      } catch (error) {
        this.logger.warn(
          `History cache lock release failed for chat ${chat_id}: ${getErrorMessage(error)}`,
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

  private async loadFromDatabase(chat_id: string): Promise<ChatHistoryEntry[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        chat_id,
        status: 'COMPLETED',
      },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });

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

  private async writeCache(
    chat_id: string,
    history: ChatHistoryEntry[],
  ): Promise<void> {
    try {
      await this.redis.setWithTtl(
        chat_id,
        JSON.stringify(history),
        this.ttl_seconds,
      );
    } catch (error) {
      this.logger.warn(
        `History cache write failed for chat ${chat_id}: ${getErrorMessage(error)}`,
      );
    }
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
