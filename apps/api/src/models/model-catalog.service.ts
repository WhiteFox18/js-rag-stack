import { Injectable } from '@nestjs/common';
import type { ModelInfo } from '@js-rag-stack/contracts';
import type { Model } from '../generated/prisma/client';
import { OllamaError } from '../ollama/ollama.errors';
import { OllamaService } from '../ollama/ollama.service';
import { ModelsRepository } from './models.repository';

@Injectable()
export class ModelCatalogService {
  constructor(
    private readonly models: ModelsRepository,
    private readonly ollama: OllamaService,
  ) {}

  async listSelectable(): Promise<ModelInfo[]> {
    const [models, installed] = await Promise.all([
      this.models.findAll(),
      this.ollama.listInstalledModels(),
    ]);
    const installedNames = new Set(installed);
    return models
      .filter((model) => model.is_available && installedNames.has(model.name))
      .map((model) => ({
        name: model.name,
        default: model.is_default,
        maxContext: model.max_context,
      }));
  }

  async resolveForGeneration(name: string): Promise<Model> {
    const model = await this.models.findByName(name);

    if (!model) {
      throw new OllamaError(
        'MODEL_NOT_ALLOWED',
        'The selected model is not allowed.',
        400,
      );
    }

    if (!model.is_available) {
      throw new OllamaError(
        'MODEL_NOT_AVAILABLE',
        'The selected model is no longer available. Choose another model.',
        409,
      );
    }

    return model;
  }
}
