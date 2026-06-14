import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { checkDependency } from './health.helpers';
import { HealthRepository } from './health.repository';
import type { ReadinessResponse } from './health.types';
import { OllamaService } from '../ollama/ollama.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly repository: HealthRepository,
    private readonly redis: RedisService,
    private readonly ollama: OllamaService,
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    const [database, redis, ollama] = await Promise.all([
      checkDependency(() => this.repository.pingDatabase()),
      checkDependency(() => this.redis.ping()),
      checkDependency(() => this.ollama.ping()),
    ]);

    return {
      status:
        database !== 'up' || redis !== 'up'
          ? 'unavailable'
          : ollama === 'up'
            ? 'ready'
            : 'degraded',
      checks: { database, redis, ollama },
    };
  }
}
