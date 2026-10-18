import { ApiProperty } from '@nestjs/swagger';

export class AdminChatOwnerDto {
  @ApiProperty({ enum: ['user', 'anonymous'] }) type!: 'user' | 'anonymous';
  @ApiProperty() id!: string;
  @ApiProperty({ required: false }) email?: string;
}

export class AdminChatMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['user', 'assistant'] }) role!: 'user' | 'assistant';
  @ApiProperty({ enum: ['streaming', 'completed', 'failed', 'cancelled'] })
  status!: 'streaming' | 'completed' | 'failed' | 'cancelled';
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, nullable: true }) model!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: Number, nullable: true }) promptTokens!: number | null;
  @ApiProperty({ type: Number, nullable: true })
  completionTokens!: number | null;
}

export class AdminChatInfoDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() model!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) lastMessageAt!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  archivedAt!: string | null;
  @ApiProperty({ type: AdminChatOwnerDto, nullable: true })
  owner!: AdminChatOwnerDto | null;
}

export class AdminChatDetailDto {
  @ApiProperty({ type: AdminChatInfoDto }) chat!: AdminChatInfoDto;
  @ApiProperty({ type: AdminChatMessageDto, isArray: true })
  messages!: AdminChatMessageDto[];
}

export class AdminChatSummaryStateDto {
  @ApiProperty({ type: String, nullable: true }) content!: string | null;
  @ApiProperty({ type: String, nullable: true })
  summarizedThroughMessageId!: string | null;
  @ApiProperty({ type: String, nullable: true }) model!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  generatedAt!: string | null;
  @ApiProperty() stale!: boolean;
  @ApiProperty() pendingMessages!: number;
  @ApiProperty() generating!: boolean;
}
