import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

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
    type: [String],
    required: false,
    description: 'URL ảnh (thường thêm sau qua /devices/:id/images)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
