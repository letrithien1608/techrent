import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { DeviceStatus } from '../../generated/prisma/client';

export class UpdateDeviceDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  specs?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Mô tả chi tiết: tình trạng máy, phụ kiện đi kèm, bảo hành còn lại, năm sản xuất...',
  })
  @IsOptional()
  @IsString()
  detailedDescription?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerHour?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerDay?: number;

  @ApiPropertyOptional({
    description: 'Giá gốc/giá trị tài sản (VNĐ) — dùng tính tiền cọc 50%',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @ApiProperty({ enum: DeviceStatus, required: false })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiProperty({
    type: [String],
    required: false,
    description:
      'Thay toàn bộ danh sách ảnh hiện có. Nếu có, tối thiểu 5 ảnh.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(5, { message: 'Thiết bị cần tối thiểu 5 ảnh' })
  @IsString({ each: true })
  images?: string[];
}
