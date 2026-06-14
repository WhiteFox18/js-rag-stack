import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import { OllamaClientService } from './ollama-client.service';
import { OllamaError } from './ollama.errors';
import type { OllamaModel, StreamOllamaChatParams } from './ollama.types';

@Injectable()
export class OllamaService {
  readonly defaultModel: string;
  private readonly allowedModels: Set<string>;

  constructor(
    private readonly client: OllamaClientService,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.allowedModels = new Set(
      config.get('OLLAMA_ALLOWED_MODELS', { infer: true }),
    );
    this.defaultModel = config.get('OLLAMA_DEFAULT_MODEL', { infer: true });
  }

  async listModels(): Promise<OllamaModel[]> {
    const installed = new Set(await this.client.listInstalledModels());
    return [...this.allowedModels]
      .filter((name) => installed.has(name))
      .map((name) => ({ name, default: name === this.defaultModel }));
  }

  assertAllowed(model: string): void {
    if (!this.allowedModels.has(model)) {
      throw new OllamaError(
        'MODEL_NOT_ALLOWED',
        'The selected model is not allowed.',
        400,
      );
    }
  }

  async assertAvailable(model: string): Promise<void> {
    this.assertAllowed(model);
    const installed = await this.client.listInstalledModels();

    if (!installed.includes(model)) {
      throw new OllamaError(
        'MODEL_NOT_AVAILABLE',
        'The selected model is not installed.',
      );
    }
  }

  streamChat(params: StreamOllamaChatParams) {
    this.assertAllowed(params.model);
    return this.client.streamChat(params);
  }

  async ping(): Promise<void> {
    await this.client.listInstalledModels();
  }
}
