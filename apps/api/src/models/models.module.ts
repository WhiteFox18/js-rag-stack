import { Module } from '@nestjs/common';
import { OllamaModule } from '../ollama/ollama.module';
import { ModelCatalogService } from './model-catalog.service';
import { ModelDefaultSeeder } from './model-default.seeder';
import { ModelsController } from './models.controller';
import { ModelsRepository } from './models.repository';

@Module({
  imports: [OllamaModule],
  controllers: [ModelsController],
  providers: [ModelsRepository, ModelCatalogService, ModelDefaultSeeder],
  exports: [ModelCatalogService],
})
export class ModelsModule {}
