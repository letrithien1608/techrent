import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ description: 'ID booking cần thanh toán tiền cọc' })
  @IsUUID()
  bookingId: string;
}
