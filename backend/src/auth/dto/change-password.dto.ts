import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentP@ssword1' })
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'NewStr0ngP@ssword' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
