import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MaintenanceStatus } from '../../generated/prisma/client';

export class UpdateMaintenanceStatusDto {
  @ApiProperty({ enum: MaintenanceStatus })
  @IsEnum(MaintenanceStatus)
  status: MaintenanceStatus;
}
