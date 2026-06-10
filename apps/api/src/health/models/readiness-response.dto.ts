import { ApiProperty } from '@nestjs/swagger';
import type { ReadinessResponse } from '../health.service';

type DependencyChecks = ReadinessResponse['checks'];

class DependencyChecksDto implements DependencyChecks {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database!: 'up' | 'down';

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  redis!: 'up' | 'down';
}

export class ReadinessResponseDto implements ReadinessResponse {
  @ApiProperty({ enum: ['ready', 'unavailable'], example: 'ready' })
  status!: 'ready' | 'unavailable';

  @ApiProperty({ type: DependencyChecksDto })
  checks!: DependencyChecksDto;
}
