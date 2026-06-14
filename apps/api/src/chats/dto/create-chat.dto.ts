import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateChatDto {
  @ApiProperty({ example: 'qwen2.5:1.5b', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model!: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 12000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12_000)
  firstPrompt?: string;
}
