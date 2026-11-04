import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import {
  CCCD_MESSAGE,
  CCCD_REGEX,
  VN_PHONE_MESSAGE,
  VN_PHONE_REGEX,
} from '../dto/register.dto';

/**
 * Đăng ký bằng Google/Facebook: CÙNG quy tắc với `RegisterDto` (dùng lại đúng
 * regex SĐT/CCCD), chỉ bỏ mật khẩu. `email` chỉ dùng khi provider không trả
 * email đã xác minh (VD Facebook không có email) — có email đã xác minh thì
 * server luôn dùng email đó, bỏ qua giá trị client gửi.
 */
export class SocialRegisterDto {
  @ApiProperty({
    description: 'Phiếu đăng ký nhận từ /register/social?ticket=',
  })
  @IsString()
  @MinLength(10)
  ticket: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email?: string;

  @ApiProperty({ example: '0901234567' })
  @Matches(VN_PHONE_REGEX, { message: VN_PHONE_MESSAGE })
  phone: string;

  @ApiProperty({ example: '079203012345' })
  @Matches(CCCD_REGEX, { message: CCCD_MESSAGE })
  cccd: string;

  @ApiProperty({ example: true })
  @Equals(true, { message: 'Bạn cần đồng ý với điều khoản sử dụng' })
  acceptTerms: boolean;
}

export class SocialExchangeDto {
  @ApiProperty()
  @IsString()
  @MinLength(10)
  code: string;
}

export class SetPasswordDto {
  @ApiProperty({ example: 'Str0ngP@ssword' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
