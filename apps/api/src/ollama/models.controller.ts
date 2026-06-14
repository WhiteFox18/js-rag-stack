import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ModelsResponse } from '@js-rag-stack/contracts';
import { ModelsResponseDto } from './models/models-response.dto';
import { OllamaService } from './ollama.service';

@ApiTags('models')
@Controller('models')
export class ModelsController {
  constructor(private readonly ollama: OllamaService) {}

  @Get()
  @ApiOperation({
    summary: 'List installed Ollama models permitted by the server allowlist',
  })
  @ApiOkResponse({ type: ModelsResponseDto })
  @ApiServiceUnavailableResponse({ description: 'Ollama is unavailable' })
  async list(): Promise<ModelsResponse> {
    return { models: await this.ollama.listModels() };
  }
}
