import { Module } from '@nestjs/common';
import { OllamaClientService } from './ollama-client.service';
import { OllamaService } from './ollama.service';

@Module({
  providers: [OllamaClientService, OllamaService],
  exports: [OllamaService],
})
export class OllamaModule {}
