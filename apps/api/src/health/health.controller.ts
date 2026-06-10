import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { HealthResponse } from '@js-rag-stack/contracts';
import { HealthResponseDto } from './models/health-response.dto';
import { ReadinessResponseDto } from './models/readiness-response.dto';
import { HealthService, type ReadinessResponse } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Report API process health' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Report API process liveness' })
  @ApiOkResponse({ type: HealthResponseDto })
  get_liveness(): HealthResponse {
    return this.getHealth();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Report PostgreSQL and Redis readiness' })
  @ApiOkResponse({ type: ReadinessResponseDto })
  async get_readiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponse> {
    const readiness = await this.health.readiness();
    response.status(
      readiness.status === 'ready'
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return readiness;
  }
}
