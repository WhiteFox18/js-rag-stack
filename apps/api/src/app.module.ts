import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment.schema';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AnonymousSessionsModule } from './anonymous-sessions/anonymous-sessions.module';
import { RequestPrincipalMiddleware } from './common/middleware/request-principal.middleware';
import { ChatsModule } from './chats/chats.module';
import { CsrfGuard } from './common/guards/csrf.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { SecurityModule } from './common/security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      envFilePath: ['../../.env', '.env'],
      isGlobal: true,
      validate: validateEnvironment,
    }),
    SecurityModule,
    PrismaModule,
    RedisModule,
    AnonymousSessionsModule,
    AuthModule,
    ChatsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestPrincipalMiddleware).forRoutes('{*path}');
  }
}
