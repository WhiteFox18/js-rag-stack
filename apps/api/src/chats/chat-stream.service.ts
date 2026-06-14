import {
  ConflictException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import { OllamaService } from '../ollama/ollama.service';
import type { OllamaChatChunk } from '../ollama/ollama.types';
import { ChatHistoryService } from './chat-history.service';
import { getPublicStreamError, toChatMessage } from './chats.helpers';
import { ChatOwnershipService } from './chat-ownership.service';
import { ChatsRepository } from './chats.repository';
import type { ChatHistoryEntry, StreamChatParams } from './chats.types';
import { RedisLockService } from './redis-lock.service';

@Injectable()
export class ChatStreamService {
  private readonly logger = new Logger(ChatStreamService.name);
  private readonly maxMessageChars: number;
  private readonly maxHistoryMessages: number;
  private readonly maxHistoryChars: number;
  private readonly maxResponseChars: number;
  private readonly principalSlots: number;
  private readonly lockTtlMs: number;

  constructor(
    private readonly repository: ChatsRepository,
    private readonly ownership: ChatOwnershipService,
    private readonly history: ChatHistoryService,
    private readonly locks: RedisLockService,
    private readonly ollama: OllamaService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.maxMessageChars = config.get('CHAT_MAX_MESSAGE_CHARS', {
      infer: true,
    });
    this.maxHistoryMessages = config.get('CHAT_MAX_HISTORY_MESSAGES', {
      infer: true,
    });
    this.maxHistoryChars = config.get('CHAT_MAX_HISTORY_CHARS', {
      infer: true,
    });
    this.maxResponseChars = config.get('CHAT_MAX_RESPONSE_CHARS', {
      infer: true,
    });
    this.principalSlots = config.get(
      'CHAT_MAX_CONCURRENT_GENERATIONS_PER_PRINCIPAL',
      { infer: true },
    );
    this.lockTtlMs = config.get('REDIS_LOCK_TTL_MS', { infer: true });
  }

  async stream({
    chatId,
    principal,
    content,
    model,
    signal,
    emit,
  }: StreamChatParams): Promise<void> {
    if (content.length > this.maxMessageChars) {
      throw new PayloadTooLargeException('The message is too long.');
    }

    const chat = await this.ownership.findOwnedChat({ chatId, principal });
    const selectedModel = model ?? chat.selected_model;
    await this.ollama.assertAvailable(selectedModel);
    const principalLock = await this.locks.acquirePrincipalGenerationLock({
      principal,
      slots: this.principalSlots,
    });
    if (!principalLock) {
      throw new ConflictException('Too many active generations.');
    }

    const chatLock = await this.locks.acquireGenerationLock(chatId);
    if (!chatLock) {
      await principalLock.release();
      throw new ConflictException(
        'This chat is already generating a response.',
      );
    }

    let assistantMessageId: string | undefined;
    let assistantContent = '';
    const lockRefresh = setInterval(
      () => {
        void Promise.all([
          chatLock.extend(this.lockTtlMs),
          principalLock.extend(this.lockTtlMs),
        ]).catch((error: unknown) => {
          this.logger.warn(`Generation lock renewal failed: ${String(error)}`);
        });
      },
      Math.max(1_000, Math.floor(this.lockTtlMs / 3)),
    );

    try {
      const history = this.limitHistory(await this.history.getHistory(chatId));
      const messages = await this.repository.beginGeneration({
        chatId,
        content,
        model: selectedModel,
      });
      assistantMessageId = messages.assistantMessage.id;
      await this.history.append({
        chatId,
        entry: { role: 'user', content },
      });
      emit({
        event: 'stream.started',
        data: {
          chatId,
          userMessageId: messages.userMessage.id,
          assistantMessageId,
          model: selectedModel,
        },
      });

      let finalChunk: OllamaChatChunk | undefined;
      for await (const chunk of this.ollama.streamChat({
        model: selectedModel,
        messages: [
          ...history.map(({ role, content: historyContent }) => ({
            role,
            content: historyContent,
          })),
          { role: 'user', content },
        ],
        signal,
      })) {
        if (chunk.delta) {
          if (
            assistantContent.length + chunk.delta.length >
            this.maxResponseChars
          ) {
            throw new PayloadTooLargeException(
              'The model response exceeded the configured limit.',
            );
          }
          assistantContent += chunk.delta;
          emit({
            event: 'message.delta',
            data: { assistantMessageId, delta: chunk.delta },
          });
        }
        if (chunk.done) finalChunk = chunk;
      }

      if (!finalChunk) {
        throw new Error('Ollama stream ended without a completion frame.');
      }

      const completed = await this.repository.completeGeneration({
        assistantMessageId,
        content: assistantContent,
        promptTokens: finalChunk.promptTokens,
        completionTokens: finalChunk.completionTokens,
        finishReason: finalChunk.finishReason,
      });
      await this.history.refresh(chatId);
      emit({
        event: 'message.completed',
        data: { message: toChatMessage(completed) },
      });
    } catch (error) {
      if (assistantMessageId) {
        if (signal.aborted) {
          await this.repository.endGeneration({
            assistantMessageId,
            content: assistantContent,
          });
          emit({
            event: 'stream.cancelled',
            data: { assistantMessageId, status: 'cancelled' },
          });
        } else {
          const publicError = getPublicStreamError(error);
          await this.repository.endGeneration({
            assistantMessageId,
            content: assistantContent,
            errorCode: publicError.code,
          });
          emit({ event: 'stream.error', data: publicError });
        }
      } else {
        throw error;
      }
    } finally {
      clearInterval(lockRefresh);
      await Promise.allSettled([chatLock.release(), principalLock.release()]);
    }
  }

  private limitHistory(history: ChatHistoryEntry[]): ChatHistoryEntry[] {
    const limited: ChatHistoryEntry[] = [];
    let characters = 0;

    for (const entry of history.slice(-this.maxHistoryMessages).reverse()) {
      if (characters + entry.content.length > this.maxHistoryChars) break;
      limited.push(entry);
      characters += entry.content.length;
    }

    return limited.reverse();
  }
}
