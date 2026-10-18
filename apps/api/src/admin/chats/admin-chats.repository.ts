import { Injectable } from '@nestjs/common';
import type { Message } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ADMIN_CHAT_INCLUDE,
  type AdminChatRecord,
  type AdminChatSummaryWithModel,
  type UpsertAdminChatSummaryParams,
} from './admin-chats.types';

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

  findSummary(chatId: string): Promise<AdminChatSummaryWithModel | null> {
    return this.prisma.adminChatSummary.findUnique({
      where: { chat_id: chatId },
      include: { model: { select: { name: true } } },
    });
  }

  upsertSummary({
    chatId,
    content,
    summarizedThroughMessageId,
    modelId,
    tokenCount,
  }: UpsertAdminChatSummaryParams): Promise<AdminChatSummaryWithModel> {
    const data = {
      content,
      summarized_through_message_id: summarizedThroughMessageId,
      model_id: modelId,
      token_count: tokenCount,
    };
    return this.prisma.adminChatSummary.upsert({
      where: { chat_id: chatId },
      create: { chat_id: chatId, ...data },
      update: data,
      include: { model: { select: { name: true } } },
    });
  }
}
