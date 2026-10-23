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
import { Throttle, minutes } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { BookingsService } from './bookings.service';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CheckAvailabilityQueryDto } from './dto/check-availability-query.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { SetContractSignedDto } from './dto/set-contract-signed.dto';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Public()
  @Get('availability')
  async checkAvailability(@Query() query: CheckAvailabilityQueryDto) {
    const available = await this.bookingsService.checkAvailability(
      query.deviceId,
      new Date(query.startTime),
      new Date(query.endTime),
    );
    return { available };
  }

  // Rate limit riêng cho endpoint tạo booking — tối đa 5 request/phút/user (mục 7 Roadmap)
  @Throttle({ default: { limit: 5, ttl: minutes(1) } })
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: ListBookingsQueryDto,
  ) {
    return this.bookingsService.findAll(user, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      userId: query.userId,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.bookingsService.findOneForUser(id, user);
  }

  @Roles(Role.staff, Role.admin)
  @Patch(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.bookingsService.confirm(id, user.userId);
  }

  @Roles(Role.staff, Role.admin)
  @Patch(':id/start')
  start(@Param('id') id: string) {
    return this.bookingsService.start(id);
  }

  @Roles(Role.staff, Role.admin)
  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.bookingsService.complete(id);
  }

  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookingsService.cancel(id, user, dto);
  }

  // Admin/staff "Xem/In hợp đồng" — CCCD giải mã đầy đủ để in giấy, KHÔNG lưu
  // lại (xem BookingsService.getContractForPrint()).
  @Roles(Role.staff, Role.admin)
  @Get(':id/contract')
  getContract(@Param('id') id: string) {
    return this.bookingsService.getContractForPrint(id);
  }

  @Roles(Role.staff, Role.admin)
  @Patch(':id/contract/signed')
  setContractSigned(
    @Param('id') id: string,
    @Body() dto: SetContractSignedDto,
  ) {
    return this.bookingsService.setContractSigned(id, dto.signed);
  }
}
