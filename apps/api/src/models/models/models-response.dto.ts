import { ApiProperty } from '@nestjs/swagger';

export class ModelDto {
  @ApiProperty({ example: 'qwen2.5:1.5b' })
  name!: string;

  @ApiProperty()
  default!: boolean;

  @ApiProperty({ example: 8192 })
  maxContext!: number;
}

export class ModelsResponseDto {
  @ApiProperty({ type: ModelDto, isArray: true })
  models!: ModelDto[];
}
