import { Module } from '@nestjs/common';
import { UsageModule } from '../../usage/usage.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminAnonymousSessionsController } from './admin-anonymous-sessions.controller';
import { AdminAnonymousSessionsRepository } from './admin-anonymous-sessions.repository';
import { AdminAnonymousSessionsService } from './admin-anonymous-sessions.service';

@Module({
  imports: [AdminAuthModule, UsageModule],
  controllers: [AdminAnonymousSessionsController],
  providers: [AdminAnonymousSessionsRepository, AdminAnonymousSessionsService],
})
export class AdminAnonymousSessionsModule {}
