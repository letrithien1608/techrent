import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CancelBookingDto {
  @ApiPropertyOptional({ description: 'Lý do huỷ' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Đánh dấu huỷ do lỗi từ phía cửa hàng (VD thiết bị hỏng đột xuất) — chỉ staff/admin dùng, được hoàn 100% bất kể thời điểm huỷ (mục 4.2 Roadmap)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  storeFault?: boolean;
}
