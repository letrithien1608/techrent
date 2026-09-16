import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMaintenanceDto {
  @ApiProperty({ description: 'ID thiết bị bị báo hỏng' })
  @IsUUID()
  deviceId: string;

  @ApiProperty({ description: 'Mô tả sự cố' })
  @IsString()
  @MinLength(3)
  issue: string;
}
