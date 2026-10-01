import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuthModule } from '../admin/auth/admin-auth.module';
import { SecurityModule } from '../common/security/security.module';
import { validateEnvironment } from '../config/environment.schema';
import { PrismaModule } from '../prisma/prisma.module';

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
    AdminAuthModule,
  ],
})
export class AdminCliModule {}
