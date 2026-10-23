import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetReviewVisibilityDto {
  @ApiProperty({ description: 'true = ẩn đánh giá, false = hiện lại' })
  @IsBoolean()
  hidden: boolean;

  @ApiPropertyOptional({ description: 'Bắt buộc khi ẩn' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
