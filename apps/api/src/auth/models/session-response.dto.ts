import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  userAgent!: string | null;

  @ApiProperty()
  current!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  lastUsedAt!: string;

  @ApiProperty()
  expiresAt!: string;
}
