import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { ListMaintenanceQueryDto } from './dto/list-maintenance-query.dto';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';
import { MaintenanceService } from './maintenance.service';

// Toàn bộ module chỉ staff/admin thao tác (mục Tuần 7 Roadmap) — khách hàng
// không tự báo hỏng/xem tình trạng bảo trì thiết bị.
@ApiTags('maintenance')
@ApiBearerAuth()
@Roles(Role.staff, Role.admin)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateMaintenanceDto) {
    return this.maintenanceService.create(user.userId, dto);
  }

  @Get()
  findAll(@Query() query: ListMaintenanceQueryDto) {
    return this.maintenanceService.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      deviceId: query.deviceId,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.maintenanceService.findByIdOrThrow(id);
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceStatusDto,
  ) {
    return this.maintenanceService.updateStatus(id, dto.status);
  }
}
