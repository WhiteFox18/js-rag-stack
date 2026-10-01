import { ApiPropertyOptional } from '@nestjs/swagger';
import type { AdminUserSort } from '@js-rag-stack/contracts';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ADMIN_USAGE_SORTS } from '../../common/admin-sorts';
import { UsagePageQueryDto } from '../../common/admin-query.dto';

export class ListUsersQueryDto extends UsagePageQueryDto {
  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  search?: string;

  @ApiPropertyOptional({ enum: ADMIN_USAGE_SORTS, default: 'lastActivity' })
  @IsOptional()
  @IsIn(ADMIN_USAGE_SORTS)
  sort?: AdminUserSort;
}
