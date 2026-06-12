import { Module } from '@nestjs/common';
import { ChatHistoryService } from './chat-history.service';
import { ChatOwnershipService } from './chat-ownership.service';
import { RedisLockService } from './redis-lock.service';
import { ChatsRepository } from './chats.repository';

@Module({
  providers: [
    ChatHistoryService,
    ChatOwnershipService,
    ChatsRepository,
    RedisLockService,
  ],
  exports: [ChatHistoryService, ChatOwnershipService, RedisLockService],
})
export class ChatsModule {}
