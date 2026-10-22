import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Role } from '../../generated/prisma/client';

export class ListUsersQueryDto {
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

  @ApiPropertyOptional({ enum: Role, description: 'Lọc theo vai trò' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Tìm theo tên hoặc email (không phân biệt hoa thường)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  // Query param boolean — KHÔNG dùng @Type(() => Boolean) (Boolean("false")
  // vẫn ra true), phải @Transform so sánh chuỗi trước — xem CLAUDE.md mục 2.
  @ApiPropertyOptional({ description: 'Lọc user đã bị đưa vào danh sách đen' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : value === 'true'))
  @IsBoolean()
  isBlacklisted?: boolean;
}
