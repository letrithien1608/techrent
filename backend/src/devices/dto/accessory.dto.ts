import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** 1 phụ kiện giao kèm thiết bị — in thành bảng trong hợp đồng/biên bản. */
export class AccessoryDto {
  @ApiProperty({ example: 'Bộ sạc (củ + cáp)' })
  @IsString()
  @MinLength(1, { message: 'Tên phụ kiện không được để trống' })
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
