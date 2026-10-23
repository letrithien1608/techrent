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

export const REVIEW_SORTS = ['newest', 'highest', 'lowest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

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

  @ApiPropertyOptional({ enum: REVIEW_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(REVIEW_SORTS)
  sort?: ReviewSort = 'newest';

  @ApiPropertyOptional({ description: 'Chỉ lấy đánh giá đúng số sao này' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}

export class ReviewDeviceQueryDto {
  @ApiProperty()
  @IsUUID()
  deviceId: string;
}

export class ListAdminReviewsQueryDto extends ListReviewsQueryDto {
  @ApiPropertyOptional({ description: 'true = chỉ đánh giá đã ẩn' })
  @IsOptional()
  // Không dùng @Type(() => Boolean): Boolean("false") === true.
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hidden?: boolean;

  @ApiPropertyOptional({ description: 'Tìm theo tên thiết bị/tên khách' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
