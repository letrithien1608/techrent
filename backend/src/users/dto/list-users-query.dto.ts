import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Role } from '../../generated/prisma/client';
import {
  MAX_SEARCH_LENGTH,
  toBoolQuery,
} from '../../common/search/admin-search.util';

export const KYC_FILTERS = ['none', 'pending', 'verified'] as const;
export type KycFilter = (typeof KYC_FILTERS)[number];
export const LOGIN_METHODS = ['password', 'google', 'facebook'] as const;
export type LoginMethod = (typeof LOGIN_METHODS)[number];
export const USER_SEARCH_SORTS = ['newest', 'name'] as const;
export type UserSearchSort = (typeof USER_SEARCH_SORTS)[number];

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
    description:
      'Tìm theo tên, email, SĐT hoặc 4 số cuối CCCD (không phân biệt hoa thường + dấu)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;

  // Query param boolean — KHÔNG dùng @Type(() => Boolean) (Boolean("false")
  // vẫn ra true), phải @Transform so sánh chuỗi trước — xem CLAUDE.md mục 2.
  @ApiPropertyOptional({ description: 'Lọc user đã bị đưa vào danh sách đen' })
  @IsOptional()
  @Transform(toBoolQuery)
  @IsBoolean()
  isBlacklisted?: boolean;

  @ApiPropertyOptional({
    enum: KYC_FILTERS,
    description:
      'eKYC: none = chưa nộp ảnh nào, pending = nộp chưa đủ 3 ảnh, verified = đủ 3 ảnh',
  })
  @IsOptional()
  @IsIn(KYC_FILTERS)
  kycStatus?: KycFilter;

  @ApiPropertyOptional({ description: 'Chỉ người còn nợ' })
  @IsOptional()
  @Transform(toBoolQuery)
  @IsBoolean()
  hasDebt?: boolean;

  @ApiPropertyOptional({ enum: LOGIN_METHODS, description: 'Cách đăng nhập' })
  @IsOptional()
  @IsIn(LOGIN_METHODS)
  loginMethod?: LoginMethod;

  @ApiPropertyOptional({
    description:
      'Ẩn tài khoản dữ liệu mẫu demo.review*@techrent.test (mặc định true)',
    default: true,
  })
  @IsOptional()
  @Transform(toBoolQuery)
  @IsBoolean()
  hideDemo?: boolean = true;

  @ApiPropertyOptional({ enum: USER_SEARCH_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(USER_SEARCH_SORTS)
  sort?: UserSearchSort = 'newest';
}
