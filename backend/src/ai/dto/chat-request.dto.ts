import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const CHAT_MESSAGE_MAX_LENGTH = 500;

export class ChatHistoryItemDto {
  @ApiProperty({ enum: ['user', 'assistant'] })
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  // Backend tự cắt còn 1000 ký tự/lượt khi dựng prompt; giới hạn ở đây chỉ để
  // chặn payload quá lớn bất thường.
  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  content!: string;
}

export class ChatRequestDto {
  @ApiProperty({ minLength: 1, maxLength: CHAT_MESSAGE_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, CHAT_MESSAGE_MAX_LENGTH, {
    message: `Câu hỏi phải từ 1 đến ${CHAT_MESSAGE_MAX_LENGTH} ký tự`,
  })
  message!: string;

  @ApiPropertyOptional({ type: [ChatHistoryItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryItemDto)
  history?: ChatHistoryItemDto[];
}
