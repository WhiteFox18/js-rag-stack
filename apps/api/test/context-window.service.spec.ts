import { PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { ContextWindowService } from '../src/chats/context-window.service';
import type { ChatHistoryEntry } from '../src/chats/chats.types';

const config = new ConfigService<AppEnvironment, true>(
  validateEnvironment({ NODE_ENV: 'test' }),
);
const now = new Date('2026-09-30T12:00:00.000Z');

function model(maxContext = 1000) {
  return {
    id: 'model-id',
    name: 'qwen2.5:1.5b',
    max_context: maxContext,
    created_at: now,
    updated_at: now,
  };
}

function history(turns: number, size: number): ChatHistoryEntry[] {
  return Array.from({ length: turns }, (_, index) => [
    {
      id: `u${index}`,
      role: 'user' as const,
      content: `${index}`.padEnd(size, 'u'),
    },
    {
      id: `a${index}`,
      role: 'assistant' as const,
      content: `${index}`.padEnd(size, 'a'),
      model: 'qwen2.5:1.5b',
    },
  ]).flat();
}

function setup({
  existingSummary = null as null | {
    content: string;
    summarized_through_message_id: string;
  },
  lastReported = null as null | {
    prompt_tokens: number;
    completion_tokens: number;
  },
} = {}) {
  const summaries = {
    findByChatId: jest.fn().mockResolvedValue(
      existingSummary
        ? {
            id: 's',
            chat_id: 'chat-id',
            token_count: 10,
            created_at: now,
            updated_at: now,
            ...existingSummary,
          }
        : null,
    ),
    upsert: jest.fn(
      (params: {
        content: string;
        summarizedThroughMessageId: string;
        tokenCount: number;
      }) =>
        Promise.resolve({
          id: 's',
          chat_id: 'chat-id',
          content: params.content,
          summarized_through_message_id: params.summarizedThroughMessageId,
          token_count: params.tokenCount,
          created_at: now,
          updated_at: now,
        }),
    ),
  };
  const repository = {
    findLastCompletedAssistantMessage: jest
      .fn()
      .mockResolvedValue(lastReported),
  };
  const ollama = {
    complete: jest
      .fn<Promise<{ content: string; completionTokens?: number }>, [unknown]>()
      .mockResolvedValue({ content: ' New summary ', completionTokens: 5 }),
  };
  const service = new ContextWindowService(
    summaries as never,
    repository as never,
    ollama as never,
    config,
  );
  return { service, summaries, repository, ollama };
}

function build(
  service: ContextWindowService,
  overrides: Partial<Parameters<ContextWindowService['buildPrompt']>[0]> = {},
) {
  return service.buildPrompt({
    chatId: 'chat-id',
    model: model(),
    history: [],
    content: 'next question',
    signal: new AbortController().signal,
    onSummarizing: jest.fn(),
    ...overrides,
  });
}

describe('ContextWindowService', () => {
  it('sends the full history when it fits', async () => {
    const { service, ollama, summaries } = setup();
    const result = await build(service, { history: history(2, 30) });

    expect(result.messages).toHaveLength(5);
    expect(result.summary).toBeNull();
    expect(ollama.complete).not.toHaveBeenCalled();
    expect(summaries.upsert).not.toHaveBeenCalled();
  });

  it('prepends an existing summary and skips already-summarized turns', async () => {
    const { service } = setup({
      existingSummary: {
        content: 'Old facts',
        summarized_through_message_id: 'a0',
      },
    });
    const result = await build(service, { history: history(2, 30) });

    expect(result.messages[0]).toEqual({
      role: 'system',
      content: 'Summary of the earlier conversation:\nOld facts',
    });
    expect(
      result.messages.slice(1).map((message) => message.content[0]),
    ).toEqual(['1', '1', 'n']);
  });

  it('folds old turns into a saved summary when over the trigger', async () => {
    const onSummarizing = jest.fn();
    const { service, ollama, summaries } = setup();
    // 6 turns × 2 × (100 + 4) ≈ 1248 tokens > trigger 750 for max_context 1000
    const result = await build(service, {
      history: history(6, 300),
      onSummarizing,
    });

    expect(onSummarizing).toHaveBeenCalledTimes(1);
    expect(ollama.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'qwen2.5:1.5b',
        contextTokens: 1000,
        maxTokens: 100,
      }),
    );
    const saved = summaries.upsert.mock.calls[0]?.[0];
    expect(saved?.content).toBe('New summary');
    expect(saved?.summarizedThroughMessageId).toMatch(/^a\d$/);
    expect(result.messages[0]?.role).toBe('system');
    // the last 4 history messages are always kept verbatim
    expect(
      result.messages.slice(-5, -1).map((message) => message.content[0]),
    ).toEqual(['4', '4', '5', '5']);
  });

  it('summarizes when the reported usage says the estimate was too low', async () => {
    const { service, ollama } = setup({
      lastReported: { prompt_tokens: 700, completion_tokens: 60 },
    });
    await build(service, { history: history(4, 30) });

    expect(ollama.complete).toHaveBeenCalled();
  });

  it('summarizes a large backlog in chunks', async () => {
    const { service, ollama, summaries } = setup();
    await build(service, { history: history(12, 600) });

    expect(ollama.complete.mock.calls.length).toBeGreaterThan(1);
    // later chunks build on the previous chunk's summary
    const secondRequest = ollama.complete.mock.calls[1]?.[0] as {
      messages: { content: string }[];
    };
    expect(secondRequest.messages[1]?.content).toContain('New summary');
    expect(summaries.upsert).toHaveBeenCalledTimes(1);
  });

  it('uses the requested model max_context', async () => {
    const { service, ollama } = setup();
    await build(service, { model: model(400), history: history(3, 300) });

    expect(ollama.complete).toHaveBeenCalledWith(
      expect.objectContaining({ contextTokens: 400 }),
    );
  });

  it('falls back to dropping old turns when summarization fails', async () => {
    const { service, ollama, summaries } = setup();
    ollama.complete.mockRejectedValue(new Error('offline'));
    const result = await build(service, { history: history(6, 300) });

    expect(summaries.upsert).not.toHaveBeenCalled();
    expect(result.summary).toBeNull();
    expect(result.messages.at(-1)).toEqual({
      role: 'user',
      content: 'next question',
    });
    expect(result.messages.length).toBeLessThan(13);
  });

  it('drops oldest turns when nothing can be folded', async () => {
    const { service, ollama } = setup();
    // 4 messages × 338 tokens > trigger 750, but keep-4 forbids folding;
    // dropping the first turn brings it to ~685.
    const result = await build(service, { history: history(2, 1000) });

    expect(ollama.complete).not.toHaveBeenCalled();
    expect(result.messages.map((message) => message.content[0])).toEqual([
      '1',
      '1',
      'n',
    ]);
  });

  it('does not save a summary when cancelled', async () => {
    const controller = new AbortController();
    const { service, ollama, summaries } = setup();
    ollama.complete.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error('aborted'));
    });

    await expect(
      build(service, { history: history(6, 300), signal: controller.signal }),
    ).rejects.toThrow('aborted');
    expect(summaries.upsert).not.toHaveBeenCalled();
  });

  it('rejects a message that alone exceeds the trigger', () => {
    const { service } = setup();
    expect(() =>
      service.assertContentFits({
        model: model(100),
        content: 'x'.repeat(600),
      }),
    ).toThrow(
      new PayloadTooLargeException(
        "The message is too long for this model's context.",
      ),
    );
    expect(() =>
      service.assertContentFits({ model: model(), content: 'short' }),
    ).not.toThrow();
  });
});
