import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Biên bản giao máy — ảnh gửi kèm qua multipart field `images` (tối thiểu HANDOVER_MIN_PHOTOS). */
export class RecordHandoverDto {
  @ApiPropertyOptional({
    description: 'Ghi chú tình trạng: trầy xước, phụ kiện kèm theo...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
