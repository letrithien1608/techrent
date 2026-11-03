import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class MarkDepositRefundedDto {
  @ApiProperty({ description: 'Mã giao dịch chuyển khoản hoàn cọc' })
  @IsString()
  @Length(3, 100, { message: 'Mã giao dịch phải từ 3 đến 100 ký tự' })
  transactionRef: string;
}
