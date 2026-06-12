import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import type { AppEnvironment } from '../config/environment.schema';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: ReturnType<typeof createClient>;
  private connectionAttempt: Promise<void> | undefined;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.client = createClient({
      url: config.get('REDIS_URL', { infer: true }),
      socket: {
        connectTimeout: config.get('REDIS_CONNECT_TIMEOUT_MS', {
          infer: true,
        }),
        reconnectStrategy: (retries) => Math.min(retries * 100, 2_000),
      },
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis connection error: ${error.message}`);
    });
  }

  get isReady(): boolean {
    return this.client.isReady;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureConnected();
    } catch (error) {
      this.logger.warn(
        `Redis unavailable during startup: ${getErrorMessage(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async ping(): Promise<void> {
    await this.ensureConnected();
    await this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return this.client.get(key);
  }

  async setWithTtl(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.ensureConnected();
    await this.client.set(key, value, { EX: ttlSeconds });
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client.set(key, value, { NX: true, PX: ttlMs });
    return result === 'OK';
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(key);
  }

  async deleteIfValueMatches(key: string, value: string): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client.eval(
      `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        end
        return 0
      `,
      { keys: [key], arguments: [value] },
    );
    return result === 1;
  }

  async extendIfValueMatches(
    key: string,
    value: string,
    ttlMs: number,
  ): Promise<boolean> {
    await this.ensureConnected();
    const result = await this.client.eval(
      `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('pexpire', KEYS[1], ARGV[2])
        end
        return 0
      `,
      { keys: [key], arguments: [value, String(ttlMs)] },
    );
    return result === 1;
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.isReady) {
      return;
    }

    if (!this.connectionAttempt) {
      this.connectionAttempt = this.client
        .connect()
        .then(() => undefined)
        .finally(() => {
          this.connectionAttempt = undefined;
        });
    }

    await this.connectionAttempt;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
