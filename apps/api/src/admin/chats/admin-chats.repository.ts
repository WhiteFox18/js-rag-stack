import { Injectable } from '@nestjs/common';
import type { Message } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_CHAT_INCLUDE, type AdminChatRecord } from './admin-chats.types';

@Injectable()
export class AdminChatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findChat(id: string): Promise<AdminChatRecord | null> {
    return this.prisma.chat.findUnique({
      where: { id },
      include: ADMIN_CHAT_INCLUDE,
    });
  }

  findMessages(chatId: string): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { chat_id: chatId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }

  async chatExists(id: string): Promise<boolean> {
    const row = await this.prisma.chat.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }
}
