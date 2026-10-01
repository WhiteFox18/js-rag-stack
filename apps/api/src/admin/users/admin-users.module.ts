import { Module } from '@nestjs/common';
import { UsageModule } from '../../usage/usage.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersRepository } from './admin-users.repository';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AdminAuthModule, UsageModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersRepository, AdminUsersService],
})
export class AdminUsersModule {}
