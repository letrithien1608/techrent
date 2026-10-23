import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'Thiết bị muốn đánh giá (phải đã thuê và trả)' })
  @IsUUID()
  deviceId: string;

  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  // Giới hạn thô chống payload quá lớn — độ dài thật (sau khi gọn khoảng trắng)
  // và nội dung spam kiểm tra ở sanitizeReviewComment().
  @MaxLength(2000)
  comment: string;
}
