import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BookingStatus,
  DepositRefundStatus,
} from '../../generated/prisma/client';
import {
  MAX_SEARCH_LENGTH,
  toBoolQuery,
} from '../../common/search/admin-search.util';

export const BOOKING_SEARCH_SORTS = ['newest', 'pickup', 'value'] as const;
export type BookingSearchSort = (typeof BOOKING_SEARCH_SORTS)[number];

/** `GET /bookings/search` — tìm + lọc đơn ở trang quản trị (staff/admin). */
export class SearchBookingsQueryDto {
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
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description:
      'Mã đơn (vài ký tự đầu), tên/email/SĐT khách, tên hoặc serial thiết bị — không phân biệt dấu',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  q?: string;

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ enum: DepositRefundStatus })
  @IsOptional()
  @IsEnum(DepositRefundStatus)
  depositRefundStatus?: DepositRefundStatus;

  @ApiPropertyOptional({
    description: 'Thời gian thuê giao với khoảng ngày này (YYYY-MM-DD, giờ VN)',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from phải có dạng YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, giờ VN, tính cả ngày này' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to phải có dạng YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: 'Chỉ đơn còn nợ' })
  @IsOptional()
  @Transform(toBoolQuery)
  @IsBoolean()
  hasDebt?: boolean;

  @ApiPropertyOptional({
    description: 'Chỉ đơn đang thuê bị đánh dấu nghi mất',
  })
  @IsOptional()
  @Transform(toBoolQuery)
  @IsBoolean()
  suspectedLost?: boolean;

  @ApiPropertyOptional({
    description: 'Ẩn đơn dữ liệu mẫu (mặc định true)',
    default: true,
  })
  @IsOptional()
  @Transform(toBoolQuery)
  @IsBoolean()
  hideDemo?: boolean = true;

  @ApiPropertyOptional({ enum: BOOKING_SEARCH_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(BOOKING_SEARCH_SORTS)
  sort?: BookingSearchSort = 'newest';
}
