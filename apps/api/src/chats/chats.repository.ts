import { Injectable } from '@nestjs/common';
import type { Chat, Message } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { FindOwnedChatParams } from './chats.types';

@Injectable()
export class ChatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOwnedChat({
    chatId,
    principal,
  }: FindOwnedChatParams): Promise<Chat | null> {
    const ownerFilter =
      principal.type === 'authenticated'
        ? { user_id: principal.user_id }
        : { anonymous_session_id: principal.anonymous_session_id };
    return this.prisma.chat.findFirst({
      where: { id: chatId, ...ownerFilter },
    });
  }

  findCompletedMessages(chatId: string): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { chat_id: chatId, status: 'COMPLETED' },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }
}
