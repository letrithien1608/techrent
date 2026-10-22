import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetContractSignedDto {
  @ApiProperty({ description: 'Nhân viên đánh dấu đã (true) hoặc chưa (false) ký tay' })
  @IsBoolean()
  signed: boolean;
}
