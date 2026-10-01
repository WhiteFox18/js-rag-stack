import { ApiProperty } from '@nestjs/swagger';

export class CsrfResponseDto {
  @ApiProperty({ description: 'Send this value in the X-CSRF-Token header.' })
  csrfToken!: string;
}
