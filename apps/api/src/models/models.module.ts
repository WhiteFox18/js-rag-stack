import { Module } from '@nestjs/common';
import { OllamaModule } from '../ollama/ollama.module';
import { ModelAdministrationService } from './model-administration.service';
import { ModelCatalogService } from './model-catalog.service';
import { ModelDefaultSeeder } from './model-default.seeder';
import { ModelsController } from './models.controller';
import { ModelsRepository } from './models.repository';

@Module({
  imports: [OllamaModule],
  controllers: [ModelsController],
  providers: [
    ModelsRepository,
    ModelCatalogService,
    ModelAdministrationService,
    ModelDefaultSeeder,
  ],
  exports: [ModelCatalogService, ModelAdministrationService],
})
export class ModelsModule {}
