import { ApiPropertyOptional } from '@nestjs/swagger';
import type { AdminUserSort } from '@js-rag-stack/contracts';
import { IsIn, IsOptional } from 'class-validator';
import { UsagePageQueryDto } from '../../common/admin-query.dto';
import { ADMIN_USAGE_SORTS } from '../../common/admin-sorts';

export class ListAnonymousQueryDto extends UsagePageQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_USAGE_SORTS, default: 'lastActivity' })
  @IsOptional()
  @IsIn(ADMIN_USAGE_SORTS)
  sort?: AdminUserSort;
}
