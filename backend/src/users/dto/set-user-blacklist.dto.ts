import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetUserBlacklistDto {
  @ApiProperty({ description: 'true: đưa vào danh sách đen, false: gỡ ra' })
  @IsBoolean()
  blacklisted: boolean;

  @ApiPropertyOptional({
    description: 'Lý do — bắt buộc khi blacklisted=true (dùng làm bằng chứng)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
