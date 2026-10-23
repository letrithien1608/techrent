import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DeviceStatus } from '../../generated/prisma/client';

export const DEVICE_SORT_VALUES = [
  'newest',
  'price_asc',
  'price_desc',
] as const;
export type DeviceSort = (typeof DEVICE_SORT_VALUES)[number];

export class ListDevicesQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Lọc theo danh mục' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Tìm theo tên thiết bị (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: DeviceStatus,
    description: 'Lọc theo trạng thái',
  })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiPropertyOptional({
    enum: DEVICE_SORT_VALUES,
    description: 'Sắp xếp: mới nhất / giá tăng dần / giá giảm dần',
  })
  @IsOptional()
  @IsIn(DEVICE_SORT_VALUES)
  sort?: DeviceSort;

  // Trang khách KHÔNG truyền → ẩn thiết bị ngừng kinh doanh. Trang admin truyền
  // true để vẫn quản lý được thiết bị cũ còn lịch sử đơn. (Không dùng @Type(Boolean) — xem mục 2 CLAUDE.md.)
  @ApiPropertyOptional({
    description: 'Gồm cả thiết bị đã ngừng kinh doanh (trang quản trị)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDiscontinued?: boolean;
}
