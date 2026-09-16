import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Laptop' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'Laptop văn phòng, gaming, đồ hoạ', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
