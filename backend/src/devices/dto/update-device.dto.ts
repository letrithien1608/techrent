import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SpecSheetEntryDto } from './spec-sheet-entry.dto';
import { AccessoryDto } from './accessory.dto';
import { SERIAL_MESSAGE, SERIAL_PATTERN } from './create-device.dto';
import { DeviceStatus } from '../../generated/prisma/client';

export class UpdateDeviceDto {
  // Có gửi thì phải hợp lệ (không cho xoá trắng serial đã có).
  @ApiPropertyOptional({ description: 'Số serial/IMEI' })
  @IsOptional()
  @IsString()
  @Matches(SERIAL_PATTERN, { message: SERIAL_MESSAGE })
  serialNumber?: string;

  @ApiPropertyOptional({ description: 'Hãng sản xuất' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string;

  @ApiPropertyOptional({ type: [AccessoryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AccessoryDto)
  accessories?: AccessoryDto[];

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
    type: [SpecSheetEntryDto],
    description:
      'Thông số kỹ thuật có cấu trúc theo mẫu của danh mục. Gửi kèm thì thay toàn bộ bảng cũ.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => SpecSheetEntryDto)
  specSheet?: SpecSheetEntryDto[];

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
    description: 'Thay toàn bộ danh sách ảnh hiện có. Nếu có, tối thiểu 5 ảnh.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(5, { message: 'Thiết bị cần tối thiểu 5 ảnh' })
  @IsString({ each: true })
  images?: string[];
}
