import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface ReadinessResponse {
  status: 'ready' | 'unavailable';
  checks: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      check_dependency(() => this.prisma.ping()),
      check_dependency(() => this.redis.ping()),
    ]);

    return {
      status: database === 'up' && redis === 'up' ? 'ready' : 'unavailable',
      checks: { database, redis },
    };
  }
}

async function check_dependency(
  check: () => Promise<void>,
): Promise<'up' | 'down'> {
  try {
    await check();
    return 'up';
  } catch {
    return 'down';
  }
}
