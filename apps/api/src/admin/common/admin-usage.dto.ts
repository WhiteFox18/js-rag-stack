import { ApiProperty } from '@nestjs/swagger';

export class UsageTotalsDto {
  @ApiProperty() requests!: number;
  @ApiProperty() inputTokens!: number;
  @ApiProperty() outputTokens!: number;
  @ApiProperty() totalTokens!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastActivityAt!: string | null;
}

export class UsageBreakdownItemDto {
  @ApiProperty() model!: string;
  @ApiProperty({ enum: ['chat', 'summary'] }) kind!: 'chat' | 'summary';
  @ApiProperty() requests!: number;
  @ApiProperty() inputTokens!: number;
  @ApiProperty() outputTokens!: number;
}

export class UsageRowDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty() model!: string;
  @ApiProperty({ enum: ['chat', 'summary'] }) kind!: 'chat' | 'summary';
  @ApiProperty() inputTokens!: number;
  @ApiProperty() outputTokens!: number;
  @ApiProperty({ type: String, nullable: true }) chatId!: string | null;
}

export class UsageRowsPageDto {
  @ApiProperty({ type: UsageRowDto, isArray: true }) items!: UsageRowDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}
