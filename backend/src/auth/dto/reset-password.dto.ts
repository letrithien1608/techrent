import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token đặt lại mật khẩu gửi qua email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewStr0ngP@ssword' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
