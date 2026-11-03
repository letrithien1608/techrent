import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmLostDto {
  @ApiPropertyOptional({ description: 'Ghi chú (đã liên hệ khách thế nào...)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
