import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { IssueResolution } from '../../generated/prisma/client';

/**
 * Xử lý báo lỗi — multipart (đổi máy gửi kèm ảnh máy thay thế ở field
 * `images`), nên số tiền đến dạng chuỗi và ép kiểu bằng @Type. Ràng buộc theo
 * từng hướng xử lý kiểm tra ở BookingIssuesService.
 */
export class ResolveIssueDto {
  @ApiProperty({ enum: IssueResolution })
  @IsEnum(IssueResolution, { message: 'Hướng xử lý không hợp lệ' })
  resolution: IssueResolution;

  @ApiPropertyOptional({ description: 'Máy thay thế (khi đổi máy)' })
  @IsOptional()
  @IsUUID()
  replacementDeviceId?: string;

  @ApiPropertyOptional({ description: 'Chi phí sửa chữa (khi lỗi do khách)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Chi phí sửa chữa phải là số' })
  @Min(0)
  repairCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
