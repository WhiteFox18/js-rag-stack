import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import { RedisService } from '../redis/redis.service';

export class RedisLock {
  constructor(
    private readonly redis: RedisService,
    readonly key: string,
    private readonly token: string,
  ) {}

  async release(): Promise<boolean> {
    return this.redis.deleteIfValueMatches(this.key, this.token);
  }

  async extend(ttlMs: number): Promise<boolean> {
    return this.redis.extendIfValueMatches(this.key, this.token, ttlMs);
  }
}

@Injectable()
export class RedisLockService {
  private readonly default_ttl_ms: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.default_ttl_ms = config.get('REDIS_LOCK_TTL_MS', { infer: true });
  }

  async acquire(
    key: string,
    ttl_ms = this.default_ttl_ms,
  ): Promise<RedisLock | undefined> {
    const token = randomBytes(24).toString('base64url');
    const acquired = await this.redis.setIfAbsent(key, token, ttl_ms);
    return acquired ? new RedisLock(this.redis, key, token) : undefined;
  }

  acquireGenerationLock(chat_id: string): Promise<RedisLock | undefined> {
    return this.acquire(`generation-lock:${chat_id}`);
  }
}
