import { Injectable, NotFoundException } from '@nestjs/common';
import type { Chat } from '../generated/prisma/client';
import { ChatsRepository } from './chats.repository';
import type { FindOwnedChatParams } from './chats.types';

@Injectable()
export class ChatOwnershipService {
  constructor(private readonly repository: ChatsRepository) {}

  async findOwnedChat({
    chatId,
    principal,
  }: FindOwnedChatParams): Promise<Chat> {
    const chat = await this.repository.findOwnedChat({ chatId, principal });

    if (!chat) {
      throw new NotFoundException('Chat not found.');
    }

    return chat;
  }
}
