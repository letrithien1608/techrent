import {
  Body,
  Controller,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
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
import { RecordHandoverDto } from './dto/record-handover.dto';
import { RecordRentalPaymentDto } from './dto/record-rental-payment.dto';
import { ConfirmReturnDto } from './dto/confirm-return.dto';
import { MarkDepositRefundedDto } from './dto/mark-deposit-refunded.dto';

const MAX_INSPECTION_IMAGES = 10;
const MAX_INSPECTION_IMAGE_BYTES = 8 * 1024 * 1024;
// Ảnh là tuỳ chọn ở tầng pipe (trả máy nguyên vẹn có thể không kèm ảnh) — số
// ảnh tối thiểu theo từng nghiệp vụ kiểm tra ở BookingsService.
const inspectionImagesPipe = new ParseFilePipe({
  fileIsRequired: false,
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_INSPECTION_IMAGE_BYTES }),
  ],
});

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
      depositRefundStatus: query.depositRefundStatus,
    });
  }

  // Đặt TRƯỚC route `GET :id` để "stats" không bị hiểu là 1 id.
  @Roles(Role.staff, Role.admin)
  @Get('stats')
  getFinancialStats() {
    return this.bookingsService.getFinancialStats();
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

  // ---- Giao máy tại quầy: biên bản (≥ HANDOVER_MIN_PHOTOS ảnh) + thu tiền thuê
  // + đánh dấu ký hợp đồng (bên dưới) → mới cho `start`.
  @Roles(Role.staff, Role.admin)
  @Post(':id/handover')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', MAX_INSPECTION_IMAGES))
  recordHandover(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RecordHandoverDto,
    @UploadedFiles(inspectionImagesPipe) files: Express.Multer.File[] = [],
  ) {
    return this.bookingsService.recordHandover(
      id,
      user.userId,
      files,
      dto.notes,
    );
  }

  @Roles(Role.staff, Role.admin)
  @Patch(':id/rental-payment')
  recordRentalPayment(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RecordRentalPaymentDto,
  ) {
    return this.bookingsService.recordRentalPayment(
      id,
      user.userId,
      dto.method,
    );
  }

  @Roles(Role.staff, Role.admin)
  @Patch(':id/start')
  start(@Param('id') id: string) {
    return this.bookingsService.start(id);
  }

  @Roles(Role.staff, Role.admin)
  @Get(':id/return-preview')
  previewReturn(
    @Param('id') id: string,
    @Query('damageFee') damageFee?: string,
  ) {
    const fee = Number(damageFee);
    return this.bookingsService.previewReturn(
      id,
      Number.isFinite(fee) && fee > 0 ? fee : 0,
    );
  }

  // Thay cho `PATCH /bookings/:id/complete` cũ: nhận lại máy + quyết toán cọc.
  @Roles(Role.staff, Role.admin)
  @Post(':id/return')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', MAX_INSPECTION_IMAGES))
  confirmReturn(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ConfirmReturnDto,
    @UploadedFiles(inspectionImagesPipe) files: Express.Multer.File[] = [],
  ) {
    return this.bookingsService.confirmReturn(id, user.userId, dto, files);
  }

  @Roles(Role.staff, Role.admin)
  @Patch(':id/deposit-refund')
  markDepositRefunded(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: MarkDepositRefundedDto,
  ) {
    return this.bookingsService.markDepositRefunded(
      id,
      user.userId,
      dto.transactionRef,
    );
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
