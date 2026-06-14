import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import { OllamaService } from '../ollama/ollama.service';
import { ChatHistoryService } from './chat-history.service';
import { deriveChatTitle, toChatMessage, toChatSummary } from './chats.helpers';
import { ChatOwnershipService } from './chat-ownership.service';
import { ChatsRepository } from './chats.repository';
import type {
  ChatDetail,
  ChatPage,
  CreateChatParams,
  ListChatsParams,
  ListMessagesParams,
  UpdateChatParams,
} from './chats.types';

@Injectable()
export class ChatsService {
  private readonly maxMessageChars: number;

  constructor(
    private readonly repository: ChatsRepository,
    private readonly ownership: ChatOwnershipService,
    private readonly history: ChatHistoryService,
    private readonly ollama: OllamaService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.maxMessageChars = config.get('CHAT_MAX_MESSAGE_CHARS', {
      infer: true,
    });
  }

  async create(params: CreateChatParams) {
    if (
      params.firstPrompt &&
      params.firstPrompt.length > this.maxMessageChars
    ) {
      throw new PayloadTooLargeException('The first prompt is too long.');
    }
    await this.ollama.assertAvailable(params.selectedModel);
    const chat = await this.repository.createChat({
      ...params,
      title:
        params.title ||
        (params.firstPrompt ? deriveChatTitle(params.firstPrompt) : 'New chat'),
    });

    return toChatSummary(chat);
  }

  async list(params: ListChatsParams): Promise<ChatPage> {
    const chats = await this.repository.listChats(params);
    const hasMore = chats.length > params.limit;
    const page = chats.slice(0, params.limit);
    return {
      chats: page.map(toChatSummary),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(params: ListMessagesParams): Promise<ChatDetail> {
    const chat = await this.ownership.findOwnedChat(params);
    const messages = await this.repository.listMessages(params);
    const hasMore = messages.length > params.limit;
    const page = messages.slice(0, params.limit);
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null;
    return {
      ...toChatSummary(chat),
      messages: page.reverse().map(toChatMessage),
      nextCursor,
    };
  }

  async update(params: UpdateChatParams) {
    if (
      params.title === undefined &&
      params.selectedModel === undefined &&
      params.archived === undefined
    ) {
      throw new BadRequestException('At least one chat field is required.');
    }

    await this.ownership.findOwnedChat(params);
    if (params.selectedModel) {
      await this.ollama.assertAvailable(params.selectedModel);
    }
    return toChatSummary(await this.repository.updateChat(params));
  }

  async delete(params: {
    chatId: string;
    principal: ListChatsParams['principal'];
  }): Promise<void> {
    await this.ownership.findOwnedChat(params);
    await this.repository.deleteChat(params.chatId);
    await this.history.invalidate(params.chatId);
  }
}
