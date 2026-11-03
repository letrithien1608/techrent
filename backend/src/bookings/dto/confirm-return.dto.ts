import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { DeviceCondition } from '../../generated/prisma/client';

/**
 * Xác nhận trả máy — gửi multipart (ảnh minh chứng ở field `images`), nên số
 * tiền đến dưới dạng chuỗi và được ép kiểu bằng @Type. Ràng buộc phụ thuộc
 * tình trạng (hư hỏng phải có mô tả/số tiền/ảnh) kiểm tra ở BookingsService.
 */
export class ConfirmReturnDto {
  @ApiProperty({ enum: DeviceCondition })
  @IsEnum(DeviceCondition, { message: 'Tình trạng thiết bị không hợp lệ' })
  condition: DeviceCondition;

  @ApiPropertyOptional({ description: 'Mô tả hư hỏng/phụ kiện thiếu' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  damageDescription?: string;

  @ApiPropertyOptional({ description: 'Số tiền bồi thường (VND)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Số tiền bồi thường phải là số' })
  @Min(0, { message: 'Số tiền bồi thường không được âm' })
  damageFee?: number;

  @ApiPropertyOptional({ description: 'Ghi chú khi nhận lại máy' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
