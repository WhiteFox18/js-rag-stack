import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StreamMessageDto {
  @ApiProperty({ maxLength: 12000 })
  @IsString()
  @MinLength(1)
  @MaxLength(12_000)
  content!: string;

  @ApiPropertyOptional({ example: 'qwen2.5:1.5b', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model?: string;
}
