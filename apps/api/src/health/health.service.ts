import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { checkDependency } from './health.helpers';
import { HealthRepository } from './health.repository';
import type { ReadinessResponse } from './health.types';

@Injectable()
export class HealthService {
  constructor(
    private readonly repository: HealthRepository,
    private readonly redis: RedisService,
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      checkDependency(() => this.repository.pingDatabase()),
      checkDependency(() => this.redis.ping()),
    ]);

    return {
      status: database === 'up' && redis === 'up' ? 'ready' : 'unavailable',
      checks: { database, redis },
    };
  }
}
