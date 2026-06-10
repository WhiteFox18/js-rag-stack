import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { AppEnvironment } from '../config/environment.schema';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnApplicationShutdown
{
  constructor(config: ConfigService<AppEnvironment, true>) {
    const connection_string = config.get('DATABASE_URL', { infer: true });
    const schema =
      new URL(connection_string).searchParams.get('schema') ?? 'public';
    super({
      adapter: new PrismaPg(connection_string, { schema }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
