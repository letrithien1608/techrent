import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** 1 dòng thông số kỹ thuật: nhóm + tên + giá trị (xem spec-sheet.util.ts). */
export class SpecSheetEntryDto {
  @ApiProperty({ example: 'Màn hình' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  group: string;

  @ApiProperty({ example: 'Tần số quét' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label: string;

  @ApiProperty({ example: '120Hz' })
  @IsString()
  @MinLength(1, { message: 'Giá trị thông số không được để trống' })
  @MaxLength(300)
  value: string;
}
