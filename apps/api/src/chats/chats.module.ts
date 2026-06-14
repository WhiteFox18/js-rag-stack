import { Module } from '@nestjs/common';
import { ChatHistoryService } from './chat-history.service';
import { ChatOwnershipService } from './chat-ownership.service';
import { RedisLockService } from './redis-lock.service';
import { ChatsRepository } from './chats.repository';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { ChatStreamService } from './chat-stream.service';
import { OllamaModule } from '../ollama/ollama.module';
import { AnonymousSessionsModule } from '../anonymous-sessions/anonymous-sessions.module';

@Module({
  imports: [AnonymousSessionsModule, OllamaModule],
  controllers: [ChatsController],
  providers: [
    ChatHistoryService,
    ChatOwnershipService,
    ChatsRepository,
    RedisLockService,
    ChatsService,
    ChatStreamService,
  ],
  exports: [ChatHistoryService, ChatOwnershipService, RedisLockService],
})
export class ChatsModule {}
