import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/** Báo lỗi thiết bị — ảnh/video gửi kèm qua multipart field `media`. */
export class ReportIssueDto {
  @ApiProperty({ description: 'Mô tả lỗi (bắt buộc)' })
  @IsString()
  @Length(10, 2000, { message: 'Mô tả lỗi cần từ 10 đến 2000 ký tự' })
  description: string;
}
