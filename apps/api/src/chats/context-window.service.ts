import { Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getErrorMessage } from '../common/utils/error';
import type { AppEnvironment } from '../config/environment.schema';
import type { ConversationSummary, Model } from '../generated/prisma/client';
import { OllamaService } from '../ollama/ollama.service';
import { ChatsRepository } from './chats.repository';
import type {
  BuildPromptParams,
  BuiltPrompt,
  ContextSettings,
  SummarizeParams,
} from './chats.types';
import {
  buildSummaryRequest,
  chunkEntries,
  dropOldestTurns,
  entriesAfter,
  estimateMessageTokens,
  estimatePromptTokens,
  getContextBudget,
  needsSummarization,
  selectTurnsToFold,
  toPromptMessages,
} from './context-window.helpers';
import { ConversationSummaryRepository } from './conversation-summary.repository';

@Injectable()
export class ContextWindowService {
  private readonly logger = new Logger(ContextWindowService.name);
  private readonly settings: ContextSettings;

  constructor(
    private readonly summaries: ConversationSummaryRepository,
    private readonly repository: ChatsRepository,
    private readonly ollama: OllamaService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.settings = {
      summarizeAtRatio: config.get('CHAT_CONTEXT_SUMMARIZE_AT_RATIO', {
        infer: true,
      }),
      targetRatio: config.get('CHAT_CONTEXT_TARGET_RATIO', { infer: true }),
      keepRecentMessages: config.get('CHAT_CONTEXT_KEEP_RECENT_MESSAGES', {
        infer: true,
      }),
      charsPerToken: config.get('CHAT_CONTEXT_CHARS_PER_TOKEN', {
        infer: true,
      }),
      summaryMaxRatio: config.get('CHAT_CONTEXT_SUMMARY_MAX_RATIO', {
        infer: true,
      }),
    };
  }

  assertContentFits({
    model,
    content,
  }: {
    model: Model;
    content: string;
  }): void {
    const { trigger } = getContextBudget(model.max_context, this.settings);
    if (estimateMessageTokens(content, this.settings.charsPerToken) > trigger) {
      throw new PayloadTooLargeException(
        "The message is too long for this model's context.",
      );
    }
  }

  async buildPrompt({
    chatId,
    model,
    history,
    content,
    signal,
    onSummarizing,
  }: BuildPromptParams): Promise<BuiltPrompt> {
    const { charsPerToken } = this.settings;
    const budget = getContextBudget(model.max_context, this.settings);
    const [existing, lastAssistant] = await Promise.all([
      this.summaries.findByChatId(chatId),
      this.repository.findLastCompletedAssistantMessage(chatId),
    ]);
    let summary = existing;
    let turns = entriesAfter(
      history,
      existing?.summarized_through_message_id ?? null,
    );

    const promptTokens = lastAssistant?.prompt_tokens ?? null;
    const completionTokens = lastAssistant?.completion_tokens ?? null;
    const lastReportedTokens =
      promptTokens === null || completionTokens === null
        ? null
        : promptTokens + completionTokens;
    const overBudget = needsSummarization({
      estimate: estimatePromptTokens({
        summary: summary?.content ?? null,
        turns,
        content,
        charsPerToken,
      }),
      lastReportedTokens,
      contentTokens: estimateMessageTokens(content, charsPerToken),
      trigger: budget.trigger,
    });

    if (overBudget) {
      const foldCount = selectTurnsToFold({
        turns,
        content,
        keepRecent: this.settings.keepRecentMessages,
        target: budget.target,
        summaryTokens: budget.summaryMaxTokens,
        charsPerToken,
      });

      if (foldCount > 0) {
        onSummarizing();
        try {
          summary = await this.summarize({
            chatId,
            model,
            previous: existing,
            folded: turns.slice(0, foldCount),
            budget,
            signal,
          });
          turns = turns.slice(foldCount);
        } catch (error) {
          if (signal.aborted) throw error;
          this.logger.warn(
            `Summarization failed for chat ${chatId}; dropping oldest turns: ${getErrorMessage(error)}`,
          );
        }
      }
    }

    // Last line of defence: whatever happened above, the prompt must fit.
    turns = dropOldestTurns({
      summary: summary?.content ?? null,
      turns,
      content,
      charsPerToken,
      limit: budget.trigger,
    });

    return {
      messages: toPromptMessages({
        summary: summary?.content ?? null,
        turns,
        content,
      }),
      summary,
    };
  }

  private async summarize({
    chatId,
    model,
    previous,
    folded,
    budget,
    signal,
  }: SummarizeParams): Promise<ConversationSummary> {
    const { charsPerToken } = this.settings;
    let content = previous?.content ?? null;
    let tokenCount = previous?.token_count ?? 0;

    for (const chunk of chunkEntries({
      entries: folded,
      budget: budget.chunkTokens,
      charsPerToken,
    })) {
      const result = await this.ollama.complete({
        model: model.name,
        messages: buildSummaryRequest({
          previousSummary: content,
          entries: chunk,
          maxEntryChars: budget.chunkTokens * charsPerToken,
        }),
        contextTokens: model.max_context,
        maxTokens: budget.summaryMaxTokens,
        signal,
      });
      content = result.content.trim();
      tokenCount =
        result.completionTokens ??
        estimateMessageTokens(content, charsPerToken);
    }

    const lastFolded = folded.at(-1);
    if (!content || !lastFolded) {
      throw new Error('The model returned an empty summary.');
    }

    return this.summaries.upsert({
      chatId,
      content,
      summarizedThroughMessageId: lastFolded.id,
      tokenCount,
    });
  }
}
