import { Module } from '@nestjs/common';
import { ModelsController } from './models.controller';
import { OllamaClientService } from './ollama-client.service';
import { OllamaService } from './ollama.service';

@Module({
  controllers: [ModelsController],
  providers: [OllamaClientService, OllamaService],
  exports: [OllamaService],
})
export class OllamaModule {}
