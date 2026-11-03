import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { BookingLossService } from './booking-loss.service';
import { ConfirmLostDto } from './dto/confirm-lost.dto';

// Mất thiết bị là quyết định nặng (giữ cọc, ghi nợ, danh sách đen) — CHỈ admin.
@ApiTags('bookings')
@ApiBearerAuth()
@Roles(Role.admin)
@Controller('bookings')
export class BookingLossController {
  constructor(private readonly lossService: BookingLossService) {}

  /** Chạy ngay việc kiểm tra quá hạn (job vẫn tự chạy mỗi giờ). */
  @Post('overdue-check')
  async runOverdueCheck() {
    return { flagged: await this.lossService.flagSuspectedLost() };
  }

  @Get(':id/loss-preview')
  previewLoss(@Param('id') id: string) {
    return this.lossService.previewLoss(id);
  }

  @Patch(':id/confirm-lost')
  confirmLost(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ConfirmLostDto,
  ) {
    return this.lossService.confirmLost(id, user.userId, dto.note);
  }
}
