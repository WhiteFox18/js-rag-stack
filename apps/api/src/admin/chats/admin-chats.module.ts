import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminChatsController } from './admin-chats.controller';
import { AdminChatsRepository } from './admin-chats.repository';
import { AdminChatsService } from './admin-chats.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminChatsController],
  providers: [AdminChatsRepository, AdminChatsService],
})
export class AdminChatsModule {}
