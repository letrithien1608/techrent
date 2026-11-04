import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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

/** Số ảnh tối thiểu của 1 thiết bị — dùng chung DTO tạo/sửa/sắp xếp ảnh. */
export const MIN_DEVICE_IMAGES = 5;

/** Serial/IMEI: 3–60 ký tự chữ, số, gạch ngang, gạch chéo, khoảng trắng. */
export const SERIAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-/ ]{2,59}$/;
export const SERIAL_MESSAGE =
  'Số serial/IMEI cần 3–60 ký tự (chữ, số, dấu gạch ngang)';

export class CreateDeviceDto {
  @ApiProperty({ example: 'MacBook Pro 14" M3' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ description: 'ID danh mục thiết bị' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({
    example: 'C02XK1ABJG5H',
    description: 'Số serial/IMEI in trên máy — in trong hợp đồng thuê',
  })
  @IsString()
  @Matches(SERIAL_PATTERN, { message: SERIAL_MESSAGE })
  serialNumber: string;

  @ApiPropertyOptional({ example: 'Apple', description: 'Hãng sản xuất' })
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

  @ApiPropertyOptional({
    description:
      'Thuộc tính động theo từng danh mục (VD: cpu, ram, storage cho laptop)',
    type: 'object',
    additionalProperties: true,
    example: { cpu: 'Apple M3 Pro', ram: '18GB', storage: '512GB SSD' },
  })
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

  @ApiProperty({ example: 50000, description: 'Giá thuê theo giờ (VNĐ)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerHour: number;

  @ApiProperty({ example: 350000, description: 'Giá thuê theo ngày (VNĐ)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pricePerDay: number;

  @ApiProperty({
    example: 45000000,
    description: 'Giá gốc/giá trị tài sản (VNĐ) — dùng tính tiền cọc 50%',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  originalPrice: number;

  @ApiProperty({
    type: [String],
    required: false,
    description:
      'URL ảnh (thường thêm sau qua /devices/:id/images). Nếu có, tối thiểu 5 ảnh.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(MIN_DEVICE_IMAGES, {
    message: `Thiết bị cần tối thiểu ${MIN_DEVICE_IMAGES} ảnh`,
  })
  @IsString({ each: true })
  images?: string[];
}
