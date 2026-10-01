import { ApiProperty } from '@nestjs/swagger';

export class AdminModelDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() maxContext!: number;
  @ApiProperty() isAvailable!: boolean;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: Boolean, nullable: true }) installed!: boolean | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class AdminModelsResponseDto {
  @ApiProperty({ type: AdminModelDto, isArray: true })
  models!: AdminModelDto[];
}
