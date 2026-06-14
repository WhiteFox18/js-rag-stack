import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import { RedisService } from '../redis/redis.service';
import type { AcquireRedisLockParams, RedisLockParams } from './chats.types';
import type { AcquirePrincipalGenerationLockParams } from './chats.types';
import { getPrincipalLockId } from './chats.helpers';

export class RedisLock {
  private readonly redis: RedisService;
  readonly key: string;
  private readonly token: string;

  constructor({ redis, key, token }: RedisLockParams) {
    this.redis = redis;
    this.key = key;
    this.token = token;
  }

  async release(): Promise<boolean> {
    return this.redis.deleteIfValueMatches({
      key: this.key,
      value: this.token,
    });
  }

  async extend(ttlMs: number): Promise<boolean> {
    return this.redis.extendIfValueMatches({
      key: this.key,
      value: this.token,
      ttlMs,
    });
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

  async acquire({
    key,
    ttlMs = this.default_ttl_ms,
  }: AcquireRedisLockParams): Promise<RedisLock | undefined> {
    const token = randomBytes(24).toString('base64url');
    const acquired = await this.redis.setIfAbsent({ key, value: token, ttlMs });
    return acquired
      ? new RedisLock({ redis: this.redis, key, token })
      : undefined;
  }

  acquireGenerationLock(chat_id: string): Promise<RedisLock | undefined> {
    return this.acquire({ key: `generation-lock:${chat_id}` });
  }

  async acquirePrincipalGenerationLock({
    principal,
    slots,
  }: AcquirePrincipalGenerationLockParams): Promise<RedisLock | undefined> {
    const principalId = getPrincipalLockId(principal);

    for (let slot = 0; slot < slots; slot += 1) {
      const lock = await this.acquire({
        key: `principal-generation-lock:${principalId}:${slot}`,
      });
      if (lock) return lock;
    }

    return undefined;
  }
}
