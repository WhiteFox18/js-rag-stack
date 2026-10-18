import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { RedisLockService } from '../../chats/redis-lock.service';
import { ModelsModule } from '../../models/models.module';
import { OllamaModule } from '../../ollama/ollama.module';
import { UsageModule } from '../../usage/usage.module';
import { AdminChatSummaryService } from './admin-chat-summary.service';
import { AdminChatsController } from './admin-chats.controller';
import { AdminChatsRepository } from './admin-chats.repository';
import { AdminChatsService } from './admin-chats.service';

@Module({
  imports: [AdminAuthModule, ModelsModule, OllamaModule, UsageModule],
  controllers: [AdminChatsController],
  providers: [
    AdminChatsRepository,
    AdminChatsService,
    AdminChatSummaryService,
    RedisLockService,
  ],
})
export class AdminChatsModule {}
