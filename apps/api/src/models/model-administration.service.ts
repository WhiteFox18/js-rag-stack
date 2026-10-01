import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdminModel, CreateModelInput } from '@js-rag-stack/contracts';
import { isUniqueViolation } from '../common/utils/error';
import type { Model } from '../generated/prisma/client';
import { OllamaService } from '../ollama/ollama.service';
import { toAdminModel } from './models.helpers';
import { ModelsRepository } from './models.repository';
import type { UpdateModelParams } from './models.types';

@Injectable()
export class ModelAdministrationService {
  constructor(
    private readonly models: ModelsRepository,
    private readonly ollama: OllamaService,
  ) {}

  async listAll(): Promise<AdminModel[]> {
    const [models, installed] = await Promise.all([
      this.models.findAll(),
      this.installedNames(),
    ]);
    return models.map((model) => toAdminModel({ model, installed }));
  }

  async create(input: CreateModelInput): Promise<AdminModel> {
    try {
      const model = await this.models.create({
        name: input.name.trim(),
        max_context: input.maxContext,
        is_available: input.isAvailable ?? true,
      });
      return this.present(model);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A model with this name already exists.');
      }
      throw error;
    }
  }

  async update({ id, input }: UpdateModelParams): Promise<AdminModel> {
    const model = await this.models.findById(id);
    if (!model) throw new NotFoundException('Model not found.');

    this.assertTransition(model, input);

    let updated = model;
    if (input.maxContext !== undefined || input.isAvailable !== undefined) {
      updated = await this.models.update({
        id,
        data: {
          max_context: input.maxContext,
          is_available: input.isAvailable,
        },
      });
    }
    if (input.isDefault === true && !model.is_default) {
      updated = await this.models.setDefault(id);
    }
    return this.present(updated);
  }

  private assertTransition(
    model: Model,
    input: UpdateModelParams['input'],
  ): void {
    if (model.is_default && input.isDefault === false) {
      throw new ConflictException('Choose another default model first.');
    }
    if (model.is_default && input.isAvailable === false) {
      throw new ConflictException(
        'The default model cannot be made unavailable.',
      );
    }
    if (input.isDefault === true && input.isAvailable === false) {
      throw new ConflictException(
        'The default model cannot be made unavailable.',
      );
    }
    if (
      input.isDefault === true &&
      !model.is_available &&
      input.isAvailable !== true
    ) {
      throw new ConflictException(
        'Make the model available before setting it as default.',
      );
    }
  }

  private async present(model: Model): Promise<AdminModel> {
    return toAdminModel({ model, installed: await this.installedNames() });
  }

  private async installedNames(): Promise<Set<string> | null> {
    try {
      return new Set(await this.ollama.listInstalledModels());
    } catch {
      return null;
    }
  }
}
