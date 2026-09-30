import { PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatStreamEvent } from '@js-rag-stack/contracts';
import { OllamaClientService } from '../src/ollama/ollama-client.service';
import { OllamaError } from '../src/ollama/ollama.errors';
import { OllamaService } from '../src/ollama/ollama.service';
import type { OllamaChatChunk } from '../src/ollama/ollama.types';
import {
  type AppEnvironment,
  validateEnvironment,
} from '../src/config/environment.schema';
import { encodeSseEvent, encodeSseHeartbeat } from '../src/chats/sse.helpers';
import { ChatStreamService } from '../src/chats/chat-stream.service';
import { toChatContext } from '../src/chats/chats.helpers';
import { ChatsService } from '../src/chats/chats.service';
import { HealthService } from '../src/health/health.service';

describe('phase 4 Ollama and SSE contracts', () => {
  const config = new ConfigService<AppEnvironment, true>(
    validateEnvironment({ NODE_ENV: 'test' }),
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists installed models that have a model row, with their context size', async () => {
    const client = {
      listInstalledModels: jest
        .fn()
        .mockResolvedValue(['qwen2.5:1.5b', 'unapproved:latest']),
    };
    const models = {
      findAll: jest
        .fn()
        .mockResolvedValue([
          createModelRecord(),
          createModelRecord('not-installed:1b', 4096),
        ]),
      findByName: jest.fn((name: string) =>
        Promise.resolve(name === 'qwen2.5:1.5b' ? createModelRecord() : null),
      ),
    };
    const service = new OllamaService(client as never, models as never, config);

    await expect(service.listModels()).resolves.toEqual([
      { name: 'qwen2.5:1.5b', default: true, maxContext: 8192 },
    ]);
    await expect(service.assertAllowed('qwen2.5:1.5b')).resolves.toEqual(
      createModelRecord(),
    );
    await expect(service.assertAllowed('unapproved:latest')).rejects.toThrow(
      OllamaError,
    );
  });

  it('fails bootstrap when the default model has no model row', async () => {
    const models = { findByName: jest.fn().mockResolvedValue(null) };
    const service = new OllamaService({} as never, models as never, config);

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'OLLAMA_DEFAULT_MODEL',
    );
    models.findByName.mockResolvedValue(createModelRecord());
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('parses streamed NDJSON without exposing thinking fields', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '{"message":{"content":"Hel","thinking":"secret"},"done":false}\n',
          ),
        );
        controller.enqueue(
          encoder.encode(
            '{"message":{"content":"lo"},"done":true,"prompt_eval_count":8,"eval_count":2,"done_reason":"stop"}\n',
          ),
        );
        controller.close();
      },
    });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(body, { status: 200 }));
    const client = new OllamaClientService(config);
    const chunks: OllamaChatChunk[] = [];

    for await (const chunk of client.streamChat({
      model: 'qwen2.5:1.5b',
      messages: [{ role: 'user', content: 'Hello' }],
      contextTokens: 8192,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { delta: 'Hel', done: false },
      {
        delta: 'lo',
        done: true,
        promptTokens: 8,
        completionTokens: 2,
        finishReason: 'stop',
      },
    ]);
    expect(JSON.stringify(chunks)).not.toContain('secret');
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      model: 'qwen2.5:1.5b',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: true,
      options: { num_ctx: 8192 },
    });
  });

  it('collects a bounded completion for summaries', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('{"message":{"content":"Short "},"done":false}\n'),
        );
        controller.enqueue(
          encoder.encode(
            '{"message":{"content":"summary"},"done":true,"prompt_eval_count":40,"eval_count":3}\n',
          ),
        );
        controller.close();
      },
    });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(body, { status: 200 }));
    const client = new OllamaClientService(config);

    await expect(
      client.complete({
        model: 'qwen2.5:1.5b',
        messages: [
          { role: 'system', content: 'Summarize.' },
          { role: 'user', content: 'Text' },
        ],
        contextTokens: 8192,
        maxTokens: 819,
      }),
    ).resolves.toEqual({
      content: 'Short summary',
      promptTokens: 40,
      completionTokens: 3,
    });
    const request = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual(
      expect.objectContaining({
        options: { num_ctx: 8192, num_predict: 819 },
      }),
    );
  });

  it('encodes named SSE frames and proxy heartbeats', () => {
    const event: ChatStreamEvent = {
      event: 'message.delta',
      data: { assistantMessageId: 'message-id', delta: 'hello' },
    };

    expect(encodeSseEvent(event)).toBe(
      'event: message.delta\ndata: {"assistantMessageId":"message-id","delta":"hello"}\n\n',
    );
    expect(encodeSseHeartbeat()).toBe(': heartbeat\n\n');
  });

  it('persists completion metadata and keeps cache history in sync', async () => {
    const contextWindow = {
      assertContentFits: jest.fn(),
      buildPrompt: jest.fn(
        ({ onSummarizing }: { onSummarizing: () => void }) => {
          onSummarizing();
          return Promise.resolve({
            messages: [{ role: 'user', content: 'Current' }],
            summary: null,
          });
        },
      ),
    };
    const completedMessage = createAssistantMessage('Hello back');
    const repository = {
      beginGeneration: jest.fn().mockResolvedValue({
        userMessage: { id: 'user-message' },
        assistantMessage: { id: 'assistant-message' },
      }),
      completeGeneration: jest.fn().mockResolvedValue(completedMessage),
      endGeneration: jest.fn(),
    };
    const history = {
      getHistory: jest
        .fn()
        .mockResolvedValue([
          { id: 'earlier', role: 'user', content: 'Earlier' },
        ]),
      append: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    const lock = {
      extend: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(true),
    };
    const ollama = {
      assertAllowed: jest.fn().mockResolvedValue(createModelRecord()),
      streamChat: async function* () {
        await Promise.resolve();
        yield { delta: 'Hello ', done: false };
        yield {
          delta: 'back',
          done: true,
          promptTokens: 12,
          completionTokens: 2,
          finishReason: 'stop',
        };
      },
    };
    const service = new ChatStreamService(
      repository as never,
      {
        findOwnedChat: jest
          .fn()
          .mockResolvedValue({ selected_model: createModelRecord() }),
      } as never,
      history as never,
      {
        acquirePrincipalGenerationLock: jest.fn().mockResolvedValue(lock),
        acquireGenerationLock: jest.fn().mockResolvedValue(lock),
      } as never,
      ollama as never,
      contextWindow as never,
      config,
    );
    const events: ChatStreamEvent[] = [];

    await service.stream({
      chatId: 'chat-id',
      principal: {
        type: 'anonymous',
        anonymous_session_id: 'anonymous-id',
      },
      content: 'Current',
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
    });

    expect(repository.completeGeneration).toHaveBeenCalledWith({
      assistantMessageId: 'assistant-message',
      content: 'Hello back',
      promptTokens: 12,
      completionTokens: 2,
      finishReason: 'stop',
    });
    expect(history.refresh).toHaveBeenCalledWith('chat-id');
    expect(events.map((event) => event.event)).toEqual([
      'stream.started',
      'context.summarizing',
      'message.delta',
      'message.delta',
      'message.completed',
      'context.updated',
    ]);
    expect(events.at(-1)).toEqual({
      event: 'context.updated',
      data: {
        usedTokens: 14,
        maxTokens: 8192,
        summary: null,
        summarizedThroughMessageId: null,
      },
    });
    expect(contextWindow.buildPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-id',
        content: 'Current',
        history: [{ id: 'earlier', role: 'user', content: 'Earlier' }],
      }),
    );
  });

  it('rejects an oversized message before locking or creating message rows', async () => {
    const repository = { beginGeneration: jest.fn() };
    const locks = {
      acquirePrincipalGenerationLock: jest.fn(),
      acquireGenerationLock: jest.fn(),
    };
    const service = new ChatStreamService(
      repository as never,
      {
        findOwnedChat: jest
          .fn()
          .mockResolvedValue({ selected_model: createModelRecord() }),
      } as never,
      {} as never,
      locks as never,
      {
        assertAllowed: jest.fn().mockResolvedValue(createModelRecord()),
      } as never,
      {
        assertContentFits: jest.fn(() => {
          throw new PayloadTooLargeException(
            "The message is too long for this model's context.",
          );
        }),
      } as never,
      config,
    );

    await expect(
      service.stream({
        chatId: 'chat-id',
        principal: { type: 'anonymous', anonymous_session_id: 'anonymous-id' },
        content: 'huge',
        signal: new AbortController().signal,
        emit: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(repository.beginGeneration).not.toHaveBeenCalled();
    expect(locks.acquirePrincipalGenerationLock).not.toHaveBeenCalled();
  });

  it('persists a partial response as cancelled when the caller aborts', async () => {
    const contextWindow = {
      assertContentFits: jest.fn(),
      buildPrompt: jest.fn(
        ({ onSummarizing }: { onSummarizing: () => void }) => {
          onSummarizing();
          return Promise.resolve({
            messages: [{ role: 'user', content: 'Current' }],
            summary: null,
          });
        },
      ),
    };
    const controller = new AbortController();
    const repository = {
      beginGeneration: jest.fn().mockResolvedValue({
        userMessage: { id: 'user-message' },
        assistantMessage: { id: 'assistant-message' },
      }),
      completeGeneration: jest.fn(),
      endGeneration: jest.fn().mockResolvedValue(undefined),
    };
    const lock = {
      extend: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(true),
    };
    const service = new ChatStreamService(
      repository as never,
      {
        findOwnedChat: jest
          .fn()
          .mockResolvedValue({ selected_model: createModelRecord() }),
      } as never,
      {
        getHistory: jest.fn().mockResolvedValue([]),
        append: jest.fn().mockResolvedValue(undefined),
        refresh: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        acquirePrincipalGenerationLock: jest.fn().mockResolvedValue(lock),
        acquireGenerationLock: jest.fn().mockResolvedValue(lock),
      } as never,
      {
        assertAllowed: jest.fn().mockResolvedValue(createModelRecord()),
        streamChat: async function* () {
          await Promise.resolve();
          yield { delta: 'partial', done: false };
          controller.abort();
          throw new Error('aborted');
        },
      } as never,
      contextWindow as never,
      config,
    );
    const events: ChatStreamEvent[] = [];

    await service.stream({
      chatId: 'chat-id',
      principal: {
        type: 'anonymous',
        anonymous_session_id: 'anonymous-id',
      },
      content: 'Current',
      signal: controller.signal,
      emit: (event) => events.push(event),
    });

    expect(repository.endGeneration).toHaveBeenCalledWith({
      assistantMessageId: 'assistant-message',
      content: 'partial',
    });
    expect(events.at(-1)).toEqual({
      event: 'stream.cancelled',
      data: { assistantMessageId: 'assistant-message', status: 'cancelled' },
    });
  });

  it('persists a failed generation and refreshes history when Ollama is down', async () => {
    const contextWindow = {
      assertContentFits: jest.fn(),
      buildPrompt: jest.fn(
        ({ onSummarizing }: { onSummarizing: () => void }) => {
          onSummarizing();
          return Promise.resolve({
            messages: [{ role: 'user', content: 'Current' }],
            summary: null,
          });
        },
      ),
    };
    const repository = {
      beginGeneration: jest.fn().mockResolvedValue({
        userMessage: { id: 'user-message' },
        assistantMessage: { id: 'assistant-message' },
      }),
      completeGeneration: jest.fn(),
      endGeneration: jest.fn().mockResolvedValue(undefined),
    };
    const history = {
      getHistory: jest.fn().mockResolvedValue([]),
      append: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    const lock = {
      extend: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(true),
    };
    const service = new ChatStreamService(
      repository as never,
      {
        findOwnedChat: jest
          .fn()
          .mockResolvedValue({ selected_model: createModelRecord() }),
      } as never,
      history as never,
      {
        acquirePrincipalGenerationLock: jest.fn().mockResolvedValue(lock),
        acquireGenerationLock: jest.fn().mockResolvedValue(lock),
      } as never,
      {
        assertAllowed: jest.fn().mockResolvedValue(createModelRecord()),
        // eslint-disable-next-line require-yield
        streamChat: async function* () {
          await Promise.resolve();
          throw new OllamaError('OLLAMA_UNAVAILABLE', 'Ollama is unavailable.');
        },
      } as never,
      contextWindow as never,
      config,
    );
    const events: ChatStreamEvent[] = [];

    await service.stream({
      chatId: 'chat-id',
      principal: { type: 'anonymous', anonymous_session_id: 'anonymous-id' },
      content: 'Current',
      signal: new AbortController().signal,
      emit: (event) => events.push(event),
    });

    expect(repository.beginGeneration).toHaveBeenCalled();
    expect(repository.endGeneration).toHaveBeenCalledWith({
      assistantMessageId: 'assistant-message',
      content: '',
      errorCode: 'OLLAMA_UNAVAILABLE',
    });
    expect(history.refresh).toHaveBeenCalledWith('chat-id');
    expect(events.at(-1)).toEqual({
      event: 'stream.error',
      data: { code: 'OLLAMA_UNAVAILABLE', message: 'Ollama is unavailable.' },
    });
  });

  it('creates chats without contacting Ollama', async () => {
    const createChat = jest.fn().mockResolvedValue(createChatRecord());
    const ollama = {
      assertAllowed: jest.fn().mockResolvedValue(createModelRecord()),
      assertAvailable: jest.fn(),
    };
    const service = new ChatsService(
      { createChat } as never,
      {} as never,
      {} as never,
      ollama as never,
      {} as never,
      config,
    );

    await service.create({
      principal: { type: 'anonymous', anonymous_session_id: 'anonymous-id' },
      title: '',
      selectedModel: 'qwen2.5:1.5b',
    });

    expect(ollama.assertAllowed).toHaveBeenCalledWith('qwen2.5:1.5b');
    expect(ollama.assertAvailable).not.toHaveBeenCalled();
    expect(createChat).toHaveBeenCalledWith(
      expect.objectContaining({ selectedModelId: 'model-qwen2.5:1.5b' }),
    );
  });

  it('reports context usage from the last completed reply and the summary', () => {
    const now = new Date('2026-06-14T12:00:00.000Z');
    expect(
      toChatContext({
        maxTokens: 8192,
        summary: {
          id: 'summary-id',
          chat_id: 'chat-id',
          content: 'Earlier: the user likes Rust.',
          summarized_through_message_id: 'message-4',
          token_count: 12,
          created_at: now,
          updated_at: now,
        },
        lastAssistantMessage: createAssistantMessage('Hi'),
      }),
    ).toEqual({
      usedTokens: 14,
      maxTokens: 8192,
      summary: 'Earlier: the user likes Rust.',
      summarizedThroughMessageId: 'message-4',
    });
    expect(
      toChatContext({
        maxTokens: 8192,
        summary: null,
        lastAssistantMessage: null,
      }),
    ).toEqual({
      usedTokens: null,
      maxTokens: 8192,
      summary: null,
      summarizedThroughMessageId: null,
    });
  });

  it('returns the chat context with the chat detail', async () => {
    const repository = {
      listMessages: jest.fn().mockResolvedValue([]),
      findLastCompletedAssistantMessage: jest
        .fn()
        .mockResolvedValue(createAssistantMessage('Hi')),
    };
    const service = new ChatsService(
      repository as never,
      {
        findOwnedChat: jest.fn().mockResolvedValue(createChatRecord()),
      } as never,
      {} as never,
      {} as never,
      { findByChatId: jest.fn().mockResolvedValue(null) } as never,
      config,
    );

    const detail = await service.get({
      chatId: 'chat-id',
      principal: { type: 'anonymous', anonymous_session_id: 'anonymous-id' },
      limit: 50,
    });

    expect(detail.context).toEqual({
      usedTokens: 14,
      maxTokens: 8192,
      summary: null,
      summarizedThroughMessageId: null,
    });
  });

  it('reports Ollama downtime as degraded without failing core readiness', async () => {
    const health = new HealthService(
      { pingDatabase: jest.fn().mockResolvedValue(undefined) } as never,
      { ping: jest.fn().mockResolvedValue(undefined) } as never,
      { ping: jest.fn().mockRejectedValue(new Error('offline')) } as never,
    );

    await expect(health.readiness()).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'up', redis: 'up', ollama: 'down' },
    });
  });
});

function createAssistantMessage(content: string) {
  const now = new Date('2026-06-14T12:00:00.000Z');
  return {
    id: 'assistant-message',
    chat_id: 'chat-id',
    role: 'ASSISTANT' as const,
    status: 'COMPLETED' as const,
    content,
    model: 'qwen2.5:1.5b',
    token_count: 2,
    token_count_source: 'OLLAMA_REPORTED' as const,
    prompt_tokens: 12,
    completion_tokens: 2,
    total_tokens: 14,
    finish_reason: 'stop',
    error_code: null,
    created_at: now,
    updated_at: now,
  };
}

function createChatRecord() {
  const now = new Date('2026-06-14T12:00:00.000Z');
  return {
    id: 'chat-id',
    user_id: null,
    anonymous_session_id: 'anonymous-id',
    title: 'New chat',
    selected_model_id: 'model-qwen2.5:1.5b',
    selected_model: createModelRecord(),
    archived_at: null,
    created_at: now,
    updated_at: now,
    last_message_at: now,
  };
}

function createModelRecord(name = 'qwen2.5:1.5b', maxContext = 8192) {
  const now = new Date('2026-06-14T12:00:00.000Z');
  return {
    id: `model-${name}`,
    name,
    max_context: maxContext,
    created_at: now,
    updated_at: now,
  };
}
