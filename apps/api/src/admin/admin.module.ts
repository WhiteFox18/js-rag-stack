import { Module } from '@nestjs/common';
import { AdminAnonymousSessionsModule } from './anonymous-sessions/admin-anonymous-sessions.module';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminModelsModule } from './models/admin-models.module';
import { AdminUsersModule } from './users/admin-users.module';

@Module({
  imports: [
    AdminAuthModule,
    AdminUsersModule,
    AdminAnonymousSessionsModule,
    AdminModelsModule,
  ],
})
export class AdminModule {}
