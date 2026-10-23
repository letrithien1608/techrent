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
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SpecSheetEntryDto } from './spec-sheet-entry.dto';

export class CreateDeviceDto {
  @ApiProperty({ example: 'MacBook Pro 14" M3' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ description: 'ID danh mục thiết bị' })
  @IsUUID()
  categoryId: string;

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
  @ArrayMinSize(5, { message: 'Thiết bị cần tối thiểu 5 ảnh' })
  @IsString({ each: true })
  images?: string[];
}
