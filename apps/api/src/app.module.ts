import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment.schema';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AnonymousSessionsModule } from './anonymous-sessions/anonymous-sessions.module';
import { RequestPrincipalMiddleware } from './common/middleware/request-principal.middleware';
import { ChatsModule } from './chats/chats.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    RedisModule,
    AnonymousSessionsModule,
    ChatsModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestPrincipalMiddleware).forRoutes('{*path}');
  }
}
