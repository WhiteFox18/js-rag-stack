import { ApiProperty } from '@nestjs/swagger';
import {
  UsageBreakdownItemDto,
  UsageTotalsDto,
} from '../../common/admin-usage.dto';

export class AdminUserSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class AdminUserListItemDto extends AdminUserSummaryDto {
  @ApiProperty({ type: UsageTotalsDto }) usage!: UsageTotalsDto;
}

export class AdminUsersPageDto {
  @ApiProperty({ type: AdminUserListItemDto, isArray: true })
  items!: AdminUserListItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

export class AdminUserDetailDto {
  @ApiProperty({ type: AdminUserSummaryDto }) user!: AdminUserSummaryDto;
  @ApiProperty({ type: UsageTotalsDto }) usage!: UsageTotalsDto;
  @ApiProperty({ type: UsageBreakdownItemDto, isArray: true })
  breakdown!: UsageBreakdownItemDto[];
}
