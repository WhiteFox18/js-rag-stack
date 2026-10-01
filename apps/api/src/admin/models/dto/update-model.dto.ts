import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_CONTEXT, MIN_CONTEXT } from './create-model.dto';

export class UpdateModelDto {
  @ApiPropertyOptional({ minimum: MIN_CONTEXT, maximum: MAX_CONTEXT })
  @IsOptional()
  @IsInt()
  @Min(MIN_CONTEXT)
  @Max(MAX_CONTEXT)
  maxContext?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
