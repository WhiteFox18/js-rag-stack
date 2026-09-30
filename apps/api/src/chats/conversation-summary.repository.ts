import { Injectable } from '@nestjs/common';
import type { ConversationSummary } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UpsertConversationSummaryParams } from './chats.types';

@Injectable()
export class ConversationSummaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByChatId(chatId: string): Promise<ConversationSummary | null> {
    return this.prisma.conversationSummary.findUnique({
      where: { chat_id: chatId },
    });
  }

  upsert({
    chatId,
    content,
    summarizedThroughMessageId,
    tokenCount,
  }: UpsertConversationSummaryParams): Promise<ConversationSummary> {
    const data = {
      content,
      summarized_through_message_id: summarizedThroughMessageId,
      token_count: tokenCount,
    };
    return this.prisma.conversationSummary.upsert({
      where: { chat_id: chatId },
      create: { chat_id: chatId, ...data },
      update: data,
    });
  }
}
