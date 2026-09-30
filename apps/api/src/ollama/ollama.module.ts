import { Module } from '@nestjs/common';
import { ModelsController } from './models.controller';
import { ModelsRepository } from './models.repository';
import { OllamaClientService } from './ollama-client.service';
import { OllamaService } from './ollama.service';

@Module({
  controllers: [ModelsController],
  providers: [OllamaClientService, OllamaService, ModelsRepository],
  exports: [OllamaService],
})
export class OllamaModule {}
