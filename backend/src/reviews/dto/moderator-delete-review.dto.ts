import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ModeratorDeleteReviewDto {
  @ApiProperty({
    description:
      'Lý do xoá (bắt buộc) — gửi kèm trong thông báo cho người viết',
    example: 'Spam / quảng cáo',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}
