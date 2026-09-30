import { Injectable } from '@nestjs/common';
import type { Message } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { estimateTokenCount, getOwnerFilter } from './chats.helpers';
import type {
  BeginGenerationParams,
  CompleteGenerationParams,
  ChatWithModel,
  CreateChatRecordParams,
  EndGenerationParams,
  FindOwnedChatParams,
  GenerationMessages,
  ListChatsParams,
  ListMessagesParams,
  UpdateChatRecordParams,
} from './chats.types';

const withModel = { selected_model: true } as const;

@Injectable()
export class ChatsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOwnedChat({
    chatId,
    principal,
  }: FindOwnedChatParams): Promise<ChatWithModel | null> {
    return this.prisma.chat.findFirst({
      where: { id: chatId, ...getOwnerFilter(principal) },
      include: withModel,
    });
  }

  findMessagesForHistory(chatId: string): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { chat_id: chatId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  }

  async createChat({
    principal,
    title,
    selectedModelId,
    firstPrompt,
  }: CreateChatRecordParams): Promise<ChatWithModel> {
    return this.prisma.$transaction(async (transaction) => {
      const chat = await transaction.chat.create({
        data: {
          ...getOwnerFilter(principal),
          title,
          selected_model_id: selectedModelId,
        },
        include: withModel,
      });

      if (firstPrompt) {
        await transaction.message.create({
          data: {
            chat_id: chat.id,
            role: 'USER',
            status: 'COMPLETED',
            content: firstPrompt,
            token_count: estimateTokenCount(firstPrompt),
            token_count_source: 'ESTIMATED',
          },
        });
      }

      return chat;
    });
  }

  listChats({
    principal,
    cursor,
    limit,
    includeArchived,
  }: ListChatsParams): Promise<ChatWithModel[]> {
    return this.prisma.chat.findMany({
      where: {
        ...getOwnerFilter(principal),
        ...(includeArchived ? {} : { archived_at: null }),
      },
      orderBy: [{ last_message_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: withModel,
    });
  }

  listMessages({
    chatId,
    cursor,
    limit,
  }: ListMessagesParams): Promise<Message[]> {
    return this.prisma.message.findMany({
      where: { chat_id: chatId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  updateChat({
    chatId,
    title,
    selectedModelId,
    archived,
  }: UpdateChatRecordParams): Promise<ChatWithModel> {
    return this.prisma.chat.update({
      where: { id: chatId },
      data: {
        ...(title === undefined ? {} : { title }),
        ...(selectedModelId === undefined
          ? {}
          : { selected_model_id: selectedModelId }),
        ...(archived === undefined
          ? {}
          : { archived_at: archived ? new Date() : null }),
      },
      include: withModel,
    });
  }

  async deleteChat(chatId: string): Promise<void> {
    await this.prisma.chat.delete({ where: { id: chatId } });
  }

  beginGeneration({
    chatId,
    content,
    model,
  }: BeginGenerationParams): Promise<GenerationMessages> {
    return this.prisma.$transaction(async (transaction) => {
      const userMessage = await transaction.message.create({
        data: {
          chat_id: chatId,
          role: 'USER',
          status: 'COMPLETED',
          content,
          token_count: estimateTokenCount(content),
          token_count_source: 'ESTIMATED',
        },
      });
      const assistantMessage = await transaction.message.create({
        data: {
          chat_id: chatId,
          role: 'ASSISTANT',
          status: 'STREAMING',
          content: '',
          model,
          token_count_source: 'UNKNOWN',
        },
      });
      await transaction.chat.update({
        where: { id: chatId },
        data: { last_message_at: userMessage.created_at },
      });
      return { userMessage, assistantMessage };
    });
  }

  completeGeneration({
    assistantMessageId,
    content,
    promptTokens,
    completionTokens,
    finishReason,
  }: CompleteGenerationParams): Promise<Message> {
    return this.prisma.$transaction(async (transaction) => {
      const message = await transaction.message.update({
        where: { id: assistantMessageId },
        data: {
          content,
          status: 'COMPLETED',
          token_count: completionTokens,
          token_count_source:
            completionTokens === undefined ? 'UNKNOWN' : 'OLLAMA_REPORTED',
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens:
            promptTokens === undefined || completionTokens === undefined
              ? undefined
              : promptTokens + completionTokens,
          finish_reason: finishReason,
        },
      });
      await transaction.chat.update({
        where: { id: message.chat_id },
        data: { last_message_at: message.updated_at },
      });
      return message;
    });
  }

  endGeneration({
    assistantMessageId,
    content,
    errorCode,
  }: EndGenerationParams): Promise<Message> {
    return this.prisma.message.update({
      where: { id: assistantMessageId },
      data: {
        content,
        status: errorCode ? 'FAILED' : 'CANCELLED',
        error_code: errorCode,
      },
    });
  }
}
