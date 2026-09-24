import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListNotificationsQueryDto {
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

  // KHÔNG dùng @Type(() => Boolean) — với class-transformer, Boolean("false")
  // vẫn ra `true` (mọi chuỗi khác rỗng đều truthy trong JS), nên phải tự parse
  // đúng "true"/"false" bằng @Transform. Dùng để FE lấy nhanh số thông báo
  // CHƯA đọc qua `?isRead=false&limit=1` (đọc meta.total), không cần thêm
  // endpoint đếm riêng.
  @ApiPropertyOptional({
    description: 'Lọc theo đã đọc (true) / chưa đọc (false)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isRead?: boolean;
}
