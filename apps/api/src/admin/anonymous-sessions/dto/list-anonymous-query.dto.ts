import { ApiPropertyOptional } from '@nestjs/swagger';
import type { AdminUserSort } from '@js-rag-stack/contracts';
import { IsIn, IsOptional } from 'class-validator';
import { UsagePageQueryDto } from '../../common/admin-query.dto';
import { ADMIN_USER_SORTS } from '../../users/dto/list-users-query.dto';

export class ListAnonymousQueryDto extends UsagePageQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_USER_SORTS, default: 'lastActivity' })
  @IsOptional()
  @IsIn(ADMIN_USER_SORTS)
  sort?: AdminUserSort;
}
