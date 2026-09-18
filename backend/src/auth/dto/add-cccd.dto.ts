import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { CCCD_MESSAGE, CCCD_REGEX } from './register.dto';

export class AddCccdDto {
  @ApiProperty({ example: '079203012345', description: 'Số CCCD 12 chữ số' })
  @Matches(CCCD_REGEX, { message: CCCD_MESSAGE })
  cccd: string;
}
