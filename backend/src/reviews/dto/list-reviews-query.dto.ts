import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// relevant (mặc định ở trang công khai) = người đã thuê trước, rồi mới nhất.
export const REVIEW_SORTS = [
  'relevant',
  'newest',
  'highest',
  'lowest',
] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const ADMIN_REVIEW_STATUSES = ['visible', 'hidden', 'deleted'] as const;
export type AdminReviewStatus = (typeof ADMIN_REVIEW_STATUSES)[number];

export class ListReviewsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Lọc theo thiết bị' })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional({ enum: REVIEW_SORTS, default: 'relevant' })
  @IsOptional()
  @IsIn(REVIEW_SORTS)
  sort?: ReviewSort;

  @ApiPropertyOptional({ description: 'Chỉ lấy đánh giá đúng số sao này' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({
    description: 'true = chỉ đánh giá của người đã thuê (cần deviceId)',
  })
  @IsOptional()
  // Không dùng @Type(() => Boolean): Boolean("false") === true.
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  rentedOnly?: boolean;
}

export class ReviewDeviceQueryDto {
  @ApiProperty()
  @IsUUID()
  deviceId: string;
}

export class ListAdminReviewsQueryDto extends ListReviewsQueryDto {
  @ApiPropertyOptional({
    enum: ADMIN_REVIEW_STATUSES,
    description: 'Bỏ trống = mọi đánh giá chưa bị xoá',
  })
  @IsOptional()
  @IsIn(ADMIN_REVIEW_STATUSES)
  status?: AdminReviewStatus;

  @ApiPropertyOptional({ description: 'Tìm theo tên thiết bị/tên khách' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
