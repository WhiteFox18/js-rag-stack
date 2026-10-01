import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnvironment } from '../config/environment.schema';
import { ModelsRepository } from './models.repository';

const SEED_MAX_CONTEXT = 8192;

@Injectable()
export class ModelDefaultSeeder implements OnApplicationBootstrap {
  private readonly seedName: string;

  constructor(
    private readonly models: ModelsRepository,
    config: ConfigService<AppEnvironment, true>,
  ) {
    this.seedName = config.get('OLLAMA_DEFAULT_MODEL', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (await this.models.findDefault()) return;
    await this.models.seedDefault({
      name: this.seedName,
      maxContext: SEED_MAX_CONTEXT,
    });
  }
}
