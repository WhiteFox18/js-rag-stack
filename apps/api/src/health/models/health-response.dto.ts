import { ApiProperty } from '@nestjs/swagger';
import type { HealthResponse } from '@js-rag-stack/contracts';

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'api' })
  service!: 'api';

  @ApiProperty({ example: '2026-06-10T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: 42 })
  uptimeSeconds!: number;
}
