import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import { OllamaError } from './ollama.errors';
import type {
  OllamaChatChunk,
  OllamaChatResponse,
  OllamaTagsResponse,
  StreamOllamaChatParams,
} from './ollama.types';

@Injectable()
export class OllamaClientService {
  private readonly baseUrl: string;
  private readonly connectTimeoutMs: number;
  private readonly firstTokenTimeoutMs: number;
  private readonly idleTimeoutMs: number;
  private readonly totalTimeoutMs: number;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.baseUrl = config
      .get('OLLAMA_BASE_URL', { infer: true })
      .replace(/\/$/, '');
    this.connectTimeoutMs = config.get('OLLAMA_CONNECT_TIMEOUT_MS', {
      infer: true,
    });
    this.firstTokenTimeoutMs = config.get('OLLAMA_FIRST_TOKEN_TIMEOUT_MS', {
      infer: true,
    });
    this.idleTimeoutMs = config.get('OLLAMA_IDLE_TIMEOUT_MS', { infer: true });
    this.totalTimeoutMs = config.get('OLLAMA_TOTAL_TIMEOUT_MS', {
      infer: true,
    });
  }

  async listInstalledModels(): Promise<string[]> {
    const response = await this.fetchWithConnectTimeout(
      `${this.baseUrl}/api/tags`,
    );

    if (!response.ok) {
      throw new OllamaError('OLLAMA_UNAVAILABLE', 'Ollama is unavailable.');
    }

    let body: OllamaTagsResponse;
    try {
      body = (await response.json()) as OllamaTagsResponse;
    } catch {
      throw new OllamaError(
        'OLLAMA_INVALID_RESPONSE',
        'Ollama returned invalid model data.',
      );
    }
    return (body.models ?? [])
      .map((model) => {
        if (typeof model.name === 'string') return model.name;
        return typeof model.model === 'string' ? model.model : undefined;
      })
      .filter((model): model is string => Boolean(model));
  }

  async *streamChat({
    model,
    messages,
    signal,
  }: StreamOllamaChatParams): AsyncGenerator<OllamaChatChunk> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (signal?.aborted) controller.abort(signal.reason);
    const totalTimer = setTimeout(
      () => controller.abort(new Error('total timeout')),
      this.totalTimeoutMs,
    );

    try {
      const connectTimer = setTimeout(
        () => controller.abort(new Error('connect timeout')),
        this.connectTimeoutMs,
      );
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(connectTimer);
      }

      if (!response.ok || !response.body) {
        throw new OllamaError(
          'OLLAMA_UNAVAILABLE',
          'Ollama generation failed.',
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedToken = false;

      while (true) {
        const timeoutMs = !receivedToken
          ? this.firstTokenTimeoutMs
          : this.idleTimeoutMs;
        const result = await this.readWithTimeout(
          reader,
          timeoutMs,
          controller,
        );
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.trim()) {
            const chunk = this.parseChunk(line);
            if (chunk.delta) receivedToken = true;
            yield chunk;
          }
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) yield this.parseChunk(buffer);
    } catch (error) {
      if (error instanceof OllamaError) throw error;
      if (signal?.aborted) throw error;
      if (controller.signal.aborted) {
        throw new OllamaError('OLLAMA_TIMEOUT', 'Ollama generation timed out.');
      }
      throw new OllamaError('OLLAMA_UNAVAILABLE', 'Ollama is unavailable.');
    } finally {
      clearTimeout(totalTimer);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private async fetchWithConnectTimeout(
    input: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const abortFromCaller = () => controller.abort(upstreamSignal?.reason);
    upstreamSignal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = setTimeout(
      () => controller.abort(new Error('connect timeout')),
      this.connectTimeoutMs,
    );

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (upstreamSignal?.aborted) throw error;
      if (controller.signal.aborted) {
        throw new OllamaError('OLLAMA_TIMEOUT', 'Ollama connection timed out.');
      }
      throw new OllamaError('OLLAMA_UNAVAILABLE', 'Ollama is unavailable.');
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private async readWithTimeout(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    timeoutMs: number,
    controller: AbortController,
  ): Promise<ReadableStreamReadResult<Uint8Array>> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort(new Error('stream timeout'));
            reject(
              new OllamaError('OLLAMA_TIMEOUT', 'Ollama stream timed out.'),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private parseChunk(line: string): OllamaChatChunk {
    let body: OllamaChatResponse;

    try {
      body = JSON.parse(line) as OllamaChatResponse;
    } catch {
      throw new OllamaError(
        'OLLAMA_INVALID_RESPONSE',
        'Ollama returned invalid stream data.',
      );
    }

    if (typeof body.error === 'string') {
      throw new OllamaError('OLLAMA_UNAVAILABLE', 'Ollama generation failed.');
    }

    return {
      delta:
        typeof body.message?.content === 'string' ? body.message.content : '',
      done: body.done === true,
      promptTokens:
        typeof body.prompt_eval_count === 'number'
          ? body.prompt_eval_count
          : undefined,
      completionTokens:
        typeof body.eval_count === 'number' ? body.eval_count : undefined,
      finishReason:
        typeof body.done_reason === 'string' ? body.done_reason : undefined,
    };
  }
}
