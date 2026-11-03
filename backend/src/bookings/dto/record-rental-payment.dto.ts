import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { RentalPaymentMethod } from '../../generated/prisma/client';

export class RecordRentalPaymentDto {
  @ApiProperty({ enum: RentalPaymentMethod })
  @IsEnum(RentalPaymentMethod, {
    message: 'Hình thức thanh toán phải là tiền mặt hoặc chuyển khoản',
  })
  method: RentalPaymentMethod;
}
