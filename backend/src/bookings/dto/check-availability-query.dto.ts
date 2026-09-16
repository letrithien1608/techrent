import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class CheckAvailabilityQueryDto {
  @ApiProperty()
  @IsUUID()
  deviceId: string;

  @ApiProperty({ example: '2026-09-20T08:00:00.000Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2026-09-20T18:00:00.000Z' })
  @IsDateString()
  endTime: string;
}
