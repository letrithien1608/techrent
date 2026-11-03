import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { RentalPaymentMethod } from '../../generated/prisma/client';

export class CollectDebtDto {
  @ApiProperty({ description: 'Số tiền thu (VND), tối đa bằng số nợ còn lại' })
  @IsNumber({}, { message: 'Số tiền phải là số' })
  @Min(1000, { message: 'Số tiền thu tối thiểu 1.000đ' })
  amount: number;

  @ApiProperty({ enum: RentalPaymentMethod })
  @IsEnum(RentalPaymentMethod, {
    message: 'Hình thức thanh toán phải là tiền mặt hoặc chuyển khoản',
  })
  method: RentalPaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
