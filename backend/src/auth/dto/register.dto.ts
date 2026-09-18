import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

// Số điện thoại di động VN: 10 số, bắt đầu bằng 0 (đúng theo yêu cầu — không
// giới hạn thêm đầu số nhà mạng cụ thể để tránh chặn nhầm số hợp lệ mới).
export const VN_PHONE_REGEX = /^0\d{9}$/;
export const VN_PHONE_MESSAGE =
  'Số điện thoại không hợp lệ (phải có 10 số, bắt đầu bằng 0)';

// CCCD (căn cước công dân) kiểu mới: đúng 12 chữ số.
export const CCCD_REGEX = /^\d{12}$/;
export const CCCD_MESSAGE = 'Số CCCD phải gồm đúng 12 chữ số';

export class RegisterDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Str0ngP@ssword' })
  @IsString()
  @MinLength(8)
  password: string;

  // Bắt buộc từ khi triển khai KYC (mục 7 Roadmap) — chống 1 người tạo nhiều
  // tài khoản "sạch" để thuê rồi chiếm đoạt. User CŨ tạo trước tính năng này
  // vẫn còn `phone`/`cccdHash` NULL trong DB (nullable ở schema, xem lý do ở
  // `schema.prisma`) — validate bắt buộc chỉ áp dụng cho đăng ký MỚI từ đây.
  @ApiProperty({ example: '0901234567' })
  @Matches(VN_PHONE_REGEX, { message: VN_PHONE_MESSAGE })
  phone: string;

  @ApiProperty({ example: '079203012345', description: 'Số CCCD 12 chữ số' })
  @Matches(CCCD_REGEX, { message: CCCD_MESSAGE })
  cccd: string;
}
