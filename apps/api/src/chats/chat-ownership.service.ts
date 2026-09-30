import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatsRepository } from './chats.repository';
import type { ChatWithModel, FindOwnedChatParams } from './chats.types';

@Injectable()
export class ChatOwnershipService {
  constructor(private readonly repository: ChatsRepository) {}

  async findOwnedChat({
    chatId,
    principal,
  }: FindOwnedChatParams): Promise<ChatWithModel> {
    const chat = await this.repository.findOwnedChat({ chatId, principal });

    if (!chat) {
      throw new NotFoundException('Chat not found.');
    }

    return chat;
  }
}
