import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminChatSummaryState } from '@js-rag-stack/contracts';
import { toHistoryEntries } from '../../chats/chats.helpers';
import type { ContextSettings } from '../../chats/chats.types';
import { readContextSettings } from '../../chats/context-settings';
import {
  buildSummaryRequest,
  chunkEntries,
  estimateMessageTokens,
  getContextBudget,
  isDegenerateSummary,
} from '../../chats/context-window.helpers';
import { RedisLockService } from '../../chats/redis-lock.service';
import type { AppEnvironment } from '../../config/environment.schema';
import { ModelCatalogService } from '../../models/model-catalog.service';
import { OllamaService } from '../../ollama/ollama.service';
import { RedisService } from '../../redis/redis.service';
import { UsageRecorderService } from '../../usage/usage-recorder.service';
import { AdminChatSummaryError } from './admin-chat-summary.errors';
import {
  ADMIN_SUMMARY_INSTRUCTIONS,
  adminSummaryLockKey,
  toSummaryState,
} from './admin-chat-summary.helpers';
import { AdminChatsRepository } from './admin-chats.repository';
import type { AdminChatSummaryWithModel } from './admin-chats.types';

const ADMIN_SUMMARY_MAX_TOKENS = 400;

@Injectable()
export class AdminChatSummaryService {
  private readonly settings: ContextSettings;

  constructor(
    private readonly repository: AdminChatsRepository,
    private readonly catalog: ModelCatalogService,
    private readonly ollama: OllamaService,
    private readonly usage: UsageRecorderService,
    private readonly locks: RedisLockService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {
    this.settings = readContextSettings(config);
  }

  async getSummary(chatId: string): Promise<AdminChatSummaryState> {
    await this.assertChatExists(chatId);
    const generating =
      (await this.redis.get(adminSummaryLockKey(chatId))) !== null;
    const { state } = await this.loadState(chatId, generating);
    return state;
  }

  async refreshSummary(chatId: string): Promise<AdminChatSummaryState> {
    await this.assertChatExists(chatId);
    const lock = await this.locks.acquire({
      key: adminSummaryLockKey(chatId),
      ttlMs: this.config.get('REDIS_LOCK_TTL_MS', { infer: true }),
    });
    if (!lock) throw AdminChatSummaryError.inProgress();

    try {
      const current = await this.loadState(chatId, false);
      if (!current.state.stale) return current.state;

      const saved = await this.generate({
        chatId,
        // A summary whose anchor message vanished cannot be extended.
        previous: current.entries.some(
          (entry) =>
            entry.id === current.summary?.summarized_through_message_id,
        )
          ? current.summary
          : null,
        pending: current.pending,
        extendLock: () =>
          lock.extend(this.config.get('REDIS_LOCK_TTL_MS', { infer: true })),
      });
      // Reload: the chat may have grown while the model was working.
      const { state } = await this.loadState(chatId, false, saved);
      return state;
    } finally {
      await lock.release();
    }
  }

  private async generate({
    chatId,
    previous,
    pending,
    extendLock,
  }: {
    chatId: string;
    previous: AdminChatSummaryWithModel | null;
    pending: ReturnType<typeof toHistoryEntries>;
    extendLock: () => Promise<boolean>;
  }): Promise<AdminChatSummaryWithModel> {
    const { charsPerToken } = this.settings;
    const model = await this.catalog.getDefault();
    const budget = getContextBudget(model.max_context, this.settings);
    const signal = AbortSignal.timeout(
      this.config.get('OLLAMA_TOTAL_TIMEOUT_MS', { infer: true }),
    );
    const lastEntry = pending.at(-1);
    if (!lastEntry) throw AdminChatSummaryError.failed();

    let content: string | null = previous?.content ?? null;
    let tokenCount = previous?.token_count ?? 0;

    for (const chunk of chunkEntries({
      entries: pending,
      budget: budget.chunkTokens,
      charsPerToken,
    })) {
      const result = await this.ollama.complete({
        model: model.name,
        messages: buildSummaryRequest({
          previousSummary: content,
          entries: chunk,
          maxEntryChars: budget.chunkTokens * charsPerToken,
          instructions: ADMIN_SUMMARY_INSTRUCTIONS,
        }),
        contextTokens: model.max_context,
        maxTokens: Math.min(budget.summaryMaxTokens, ADMIN_SUMMARY_MAX_TOKENS),
        signal,
      });
      // Recorded before the degenerate check: the tokens were spent anyway.
      await this.usage.record({
        principal: null,
        chatId,
        modelId: model.id,
        kind: 'ADMIN_SUMMARY',
        inputTokens: result.promptTokens,
        outputTokens: result.completionTokens,
      });
      content = result.content.trim();
      if (isDegenerateSummary(content)) throw AdminChatSummaryError.failed();
      tokenCount =
        result.completionTokens ??
        estimateMessageTokens(content, charsPerToken);
      await extendLock();
    }

    if (content === null) throw AdminChatSummaryError.failed();
    return this.repository.upsertSummary({
      chatId,
      content,
      summarizedThroughMessageId: lastEntry.id,
      modelId: model.id,
      tokenCount,
    });
  }

  private async loadState(
    chatId: string,
    generating: boolean,
    knownSummary?: AdminChatSummaryWithModel,
  ) {
    const [summary, messages] = await Promise.all([
      knownSummary ?? this.repository.findSummary(chatId),
      this.repository.findMessages(chatId),
    ]);
    const entries = toHistoryEntries(messages);
    return {
      summary,
      entries,
      ...toSummaryState({ summary, entries, generating }),
    };
  }

  private async assertChatExists(chatId: string): Promise<void> {
    if (!(await this.repository.chatExists(chatId))) {
      throw new NotFoundException('Chat not found.');
    }
  }
}
