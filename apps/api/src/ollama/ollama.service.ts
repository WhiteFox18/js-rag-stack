import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import type { Model } from '../generated/prisma/client';
import { ModelsRepository } from './models.repository';
import { OllamaClientService } from './ollama-client.service';
import { OllamaError } from './ollama.errors';
import type {
  CompleteOllamaChatParams,
  OllamaCompletion,
  OllamaModel,
  StreamOllamaChatParams,
} from './ollama.types';

@Injectable()
export class OllamaService implements OnApplicationBootstrap {
  readonly defaultModel: string;

  constructor(
    private readonly client: OllamaClientService,
    private readonly models: ModelsRepository,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.defaultModel = config.get('OLLAMA_DEFAULT_MODEL', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!(await this.models.findByName(this.defaultModel))) {
      throw new Error(
        `OLLAMA_DEFAULT_MODEL "${this.defaultModel}" has no row in the model table.`,
      );
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const [models, installed] = await Promise.all([
      this.models.findAll(),
      this.client.listInstalledModels(),
    ]);
    const installedNames = new Set(installed);
    return models
      .filter((model) => installedNames.has(model.name))
      .map((model) => ({
        name: model.name,
        default: model.name === this.defaultModel,
        maxContext: model.max_context,
      }));
  }

  async assertAllowed(name: string): Promise<Model> {
    const model = await this.models.findByName(name);

    if (!model) {
      throw new OllamaError(
        'MODEL_NOT_ALLOWED',
        'The selected model is not allowed.',
        400,
      );
    }

    return model;
  }

  async assertAvailable(name: string): Promise<Model> {
    const model = await this.assertAllowed(name);
    const installed = await this.client.listInstalledModels();

    if (!installed.includes(name)) {
      throw new OllamaError(
        'MODEL_NOT_AVAILABLE',
        'The selected model is not installed.',
      );
    }

    return model;
  }

  // Callers resolve the model row with assertAllowed() before streaming.
  streamChat(params: StreamOllamaChatParams) {
    return this.client.streamChat(params);
  }

  complete(params: CompleteOllamaChatParams): Promise<OllamaCompletion> {
    return this.client.complete(params);
  }

  async ping(): Promise<void> {
    await this.client.listInstalledModels();
  }
}
