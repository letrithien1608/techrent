import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { DebtsService } from './debts.service';
import { CollectDebtDto } from './dto/collect-debt.dto';

@ApiTags('debts')
@ApiBearerAuth()
@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  /** Khách xem nợ của chính mình (userId lấy từ token, không nhận từ client). */
  @Get('me')
  findMine(@CurrentUser() user: RequestUser) {
    return this.debtsService.findMine(user.userId);
  }

  @Roles(Role.staff, Role.admin)
  @Get()
  findDebtors() {
    return this.debtsService.findDebtors();
  }

  @Roles(Role.staff, Role.admin)
  @Post('bookings/:bookingId/payments')
  collect(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CollectDebtDto,
  ) {
    return this.debtsService.collect(bookingId, user.userId, dto);
  }
}
