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
  private connection_attempt: Promise<void> | undefined;

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

  get is_ready(): boolean {
    return this.client.isReady;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensure_connected();
    } catch (error) {
      this.logger.warn(
        `Redis unavailable during startup: ${get_error_message(error)}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async ping(): Promise<void> {
    await this.ensure_connected();
    await this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    await this.ensure_connected();
    return this.client.get(key);
  }

  async set_with_ttl(
    key: string,
    value: string,
    ttl_seconds: number,
  ): Promise<void> {
    await this.ensure_connected();
    await this.client.set(key, value, { EX: ttl_seconds });
  }

  async set_if_absent(
    key: string,
    value: string,
    ttl_ms: number,
  ): Promise<boolean> {
    await this.ensure_connected();
    const result = await this.client.set(key, value, { NX: true, PX: ttl_ms });
    return result === 'OK';
  }

  async delete(key: string): Promise<void> {
    await this.ensure_connected();
    await this.client.del(key);
  }

  async delete_if_value_matches(key: string, value: string): Promise<boolean> {
    await this.ensure_connected();
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

  async extend_if_value_matches(
    key: string,
    value: string,
    ttl_ms: number,
  ): Promise<boolean> {
    await this.ensure_connected();
    const result = await this.client.eval(
      `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('pexpire', KEYS[1], ARGV[2])
        end
        return 0
      `,
      { keys: [key], arguments: [value, String(ttl_ms)] },
    );
    return result === 1;
  }

  private async ensure_connected(): Promise<void> {
    if (this.client.isReady) {
      return;
    }

    if (!this.connection_attempt) {
      this.connection_attempt = this.client
        .connect()
        .then(() => undefined)
        .finally(() => {
          this.connection_attempt = undefined;
        });
    }

    await this.connection_attempt;
  }
}

function get_error_message(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
