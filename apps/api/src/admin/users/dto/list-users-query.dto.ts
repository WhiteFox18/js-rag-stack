import { ApiPropertyOptional } from '@nestjs/swagger';
import type { AdminUserSort } from '@js-rag-stack/contracts';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { UsagePageQueryDto } from '../../common/admin-query.dto';

export const ADMIN_USER_SORTS: AdminUserSort[] = [
  'lastActivity',
  'totalTokens',
  'createdAt',
];

export class ListUsersQueryDto extends UsagePageQueryDto {
  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  search?: string;

  @ApiPropertyOptional({ enum: ADMIN_USER_SORTS, default: 'lastActivity' })
  @IsOptional()
  @IsIn(ADMIN_USER_SORTS)
  sort?: AdminUserSort;
}
