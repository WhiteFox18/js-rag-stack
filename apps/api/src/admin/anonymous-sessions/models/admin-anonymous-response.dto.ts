import { ApiProperty } from '@nestjs/swagger';
import {
  UsageBreakdownItemDto,
  UsageTotalsDto,
} from '../../common/admin-usage.dto';

export class AdminAnonymousSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastSeenAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() chatCount!: number;
}

export class AdminAnonymousListItemDto extends AdminAnonymousSummaryDto {
  @ApiProperty({ type: UsageTotalsDto }) usage!: UsageTotalsDto;
}

export class AdminAnonymousPageDto {
  @ApiProperty({ type: AdminAnonymousListItemDto, isArray: true })
  items!: AdminAnonymousListItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}

export class AdminAnonymousDetailDto {
  @ApiProperty({ type: AdminAnonymousSummaryDto })
  session!: AdminAnonymousSummaryDto;
  @ApiProperty({ type: UsageTotalsDto }) usage!: UsageTotalsDto;
  @ApiProperty({ type: UsageBreakdownItemDto, isArray: true })
  breakdown!: UsageBreakdownItemDto[];
}
