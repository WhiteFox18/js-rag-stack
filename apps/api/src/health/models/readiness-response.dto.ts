import { ApiProperty } from '@nestjs/swagger';
import type { ReadinessResponse } from '../health.types';

type DependencyChecks = ReadinessResponse['checks'];

class DependencyChecksDto implements DependencyChecks {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database!: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  redis!: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  ollama!: 'up' | 'down';
}

export class ReadinessResponseDto implements ReadinessResponse {
  @ApiProperty({
    enum: ['ready', 'degraded', 'unavailable'],
    example: 'ready',
  })
  status!: 'ready' | 'degraded' | 'unavailable';

  @ApiProperty({ type: DependencyChecksDto })
  checks!: DependencyChecksDto;
}
