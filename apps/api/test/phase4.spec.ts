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
import { HealthService } from '../src/health/health.service';

describe('phase 4 Ollama and SSE contracts', () => {
  const config = new ConfigService<AppEnvironment, true>(
    validateEnvironment({ NODE_ENV: 'test' }),
  );

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns only installed models that are allowed', async () => {
    const client = {
      listInstalledModels: jest
        .fn()
        .mockResolvedValue(['qwen2.5:1.5b', 'unapproved:latest']),
    };
    const service = new OllamaService(client as never, config);

    await expect(service.listModels()).resolves.toEqual([
      { name: 'qwen2.5:1.5b', default: true },
    ]);
    expect(() => service.assertAllowed('unapproved:latest')).toThrow(
      OllamaError,
    );
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
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(body, { status: 200 }));
    const client = new OllamaClientService(config);
    const chunks: OllamaChatChunk[] = [];

    for await (const chunk of client.streamChat({
      model: 'qwen2.5:1.5b',
      messages: [{ role: 'user', content: 'Hello' }],
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
        .mockResolvedValue([{ role: 'user', content: 'Earlier' }]),
      append: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
    };
    const lock = {
      extend: jest.fn().mockResolvedValue(true),
      release: jest.fn().mockResolvedValue(true),
    };
    const ollama = {
      assertAvailable: jest.fn().mockResolvedValue(undefined),
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
          .mockResolvedValue({ selected_model: 'qwen2.5:1.5b' }),
      } as never,
      history as never,
      {
        acquirePrincipalGenerationLock: jest.fn().mockResolvedValue(lock),
        acquireGenerationLock: jest.fn().mockResolvedValue(lock),
      } as never,
      ollama as never,
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
      'message.delta',
      'message.delta',
      'message.completed',
    ]);
  });

  it('persists a partial response as cancelled when the caller aborts', async () => {
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
          .mockResolvedValue({ selected_model: 'qwen2.5:1.5b' }),
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
        assertAvailable: jest.fn().mockResolvedValue(undefined),
        streamChat: async function* () {
          await Promise.resolve();
          yield { delta: 'partial', done: false };
          controller.abort();
          throw new Error('aborted');
        },
      } as never,
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
