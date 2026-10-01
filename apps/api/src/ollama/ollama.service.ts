import { Injectable } from '@nestjs/common';
import { OllamaClientService } from './ollama-client.service';
import type {
  CompleteOllamaChatParams,
  OllamaCompletion,
  StreamOllamaChatParams,
} from './ollama.types';

@Injectable()
export class OllamaService {
  constructor(private readonly client: OllamaClientService) {}

  listInstalledModels(): Promise<string[]> {
    return this.client.listInstalledModels();
  }

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
