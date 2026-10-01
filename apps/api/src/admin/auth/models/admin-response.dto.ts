import { ApiProperty } from '@nestjs/swagger';

export class AdminProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
}

export class AdminAuthResponseDto {
  @ApiProperty({ type: AdminProfileDto }) admin!: AdminProfileDto;
}
