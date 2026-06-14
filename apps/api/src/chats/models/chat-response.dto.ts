import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['user', 'assistant'] }) role!: 'user' | 'assistant';
  @ApiProperty({ enum: ['streaming', 'completed', 'failed', 'cancelled'] })
  status!: 'streaming' | 'completed' | 'failed' | 'cancelled';
  @ApiProperty() content!: string;
  @ApiPropertyOptional({ nullable: true }) model!: string | null;
  @ApiPropertyOptional({ nullable: true }) tokenCount!: number | null;
  @ApiProperty({ enum: ['ollama_reported', 'estimated', 'unknown'] })
  tokenCountSource!: 'ollama_reported' | 'estimated' | 'unknown';
  @ApiPropertyOptional({ nullable: true }) promptTokens!: number | null;
  @ApiPropertyOptional({ nullable: true }) completionTokens!: number | null;
  @ApiPropertyOptional({ nullable: true }) totalTokens!: number | null;
  @ApiPropertyOptional({ nullable: true }) finishReason!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ChatSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() selectedModel!: string;
  @ApiPropertyOptional({ nullable: true }) archivedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty() lastMessageAt!: string;
}

export class ChatPageDto {
  @ApiProperty({ type: ChatSummaryDto, isArray: true })
  chats!: ChatSummaryDto[];
  @ApiPropertyOptional({ nullable: true }) nextCursor!: string | null;
}

export class ChatDetailDto extends ChatSummaryDto {
  @ApiProperty({ type: ChatMessageDto, isArray: true })
  messages!: ChatMessageDto[];
  @ApiPropertyOptional({ nullable: true }) nextCursor!: string | null;
}
