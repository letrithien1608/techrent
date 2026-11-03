import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import {
  BookingStatus,
  DepositRefundStatus,
} from '../../generated/prisma/client';

export class ListBookingsQueryDto {
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

  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  // Chỉ staff/admin dùng được thật (customer luôn bị ép lọc theo chính userId
  // của họ trong BookingsService.findAll(), filter này bị BỎ QUA nếu customer
  // gửi lên) — dùng ở trang /admin/blacklist để tìm đúng booking liên quan
  // tới 1 user bị blacklist.
  @ApiPropertyOptional({ description: 'Lọc theo user — chỉ staff/admin' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  // Chỉ có ý nghĩa với staff/admin (trang "Hoàn cọc") — lọc pending thì sắp
  // theo hạn hoàn cọc gần nhất trước.
  @ApiPropertyOptional({ enum: DepositRefundStatus })
  @IsOptional()
  @IsEnum(DepositRefundStatus)
  depositRefundStatus?: DepositRefundStatus;
}
