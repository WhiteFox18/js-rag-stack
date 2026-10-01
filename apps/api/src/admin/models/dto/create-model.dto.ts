import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const MIN_CONTEXT = 512;
export const MAX_CONTEXT = 1_048_576;

export class CreateModelDto {
  @ApiProperty({ example: 'llama3.2:3b', maxLength: 200 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ minimum: MIN_CONTEXT, maximum: MAX_CONTEXT, example: 8192 })
  @IsInt()
  @Min(MIN_CONTEXT)
  @Max(MAX_CONTEXT)
  maxContext!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
