import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  Booking,
  BookingStatus,
  DepositRefundStatus,
  DeviceStatus,
  InspectionType,
} from '../generated/prisma/client';
import {
  calculateLateFee,
  calculateLostDeviceDebt,
  DAY_MS,
  LOST_SUSPECT_OVERDUE_DAYS,
} from '../common/business-policy';
import {
  bookingCode,
  formatVnd,
} from '../notifications/notification-templates';
import {
  BOOKING_OVERDUE_CHECK_EVERY_MS,
  BOOKING_OVERDUE_JOB,
  BOOKING_OVERDUE_QUEUE,
} from './bookings.constants';
import { BookingsService } from './bookings.service';

/**
 * Khách không trả máy: job lặp (BullMQ job scheduler, mỗi giờ) đánh dấu đơn
 * quá hạn ≥ LOST_SUSPECT_OVERDUE_DAYS ngày là "nghi mất thiết bị" + báo
 * nhân viên/khách. Admin xác nhận mất → giữ cọc, ghi nợ, thiết bị ngừng cho
 * thuê, khách vào danh sách đen kèm lý do + bằng chứng.
 */
@Injectable()
export class BookingLossService implements OnModuleInit {
  private readonly logger = new Logger(BookingLossService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly usersService: UsersService,
    @InjectQueue(BOOKING_OVERDUE_QUEUE) private readonly overdueQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      // Idempotent: khởi động lại server không tạo thêm lịch trùng.
      await this.overdueQueue.upsertJobScheduler(
        BOOKING_OVERDUE_JOB,
        { every: BOOKING_OVERDUE_CHECK_EVERY_MS },
        { name: BOOKING_OVERDUE_JOB },
      );
    } catch (error) {
      this.logger.warn(
        `Không lên lịch được job kiểm tra quá hạn: ${(error as Error).message}`,
      );
    }
  }

  /** Đánh dấu đơn đang thuê quá hạn ≥ N ngày là nghi mất (mỗi đơn 1 lần). */
  async flagSuspectedLost(now = new Date()): Promise<number> {
    const threshold = new Date(
      now.getTime() - LOST_SUSPECT_OVERDUE_DAYS * DAY_MS,
    );
    const candidates = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.ongoing,
        suspectedLostAt: null,
        endTime: { lt: threshold },
      },
    });
    let flagged = 0;
    for (const booking of candidates) {
      // Điều kiện suspectedLostAt: null ngay trong câu lệnh — 2 lần chạy
      // chồng nhau cũng chỉ đánh dấu + thông báo 1 lần.
      const { count } = await this.prisma.booking.updateMany({
        where: { id: booking.id, suspectedLostAt: null },
        data: { suspectedLostAt: now },
      });
      if (count === 0) continue;
      flagged++;
      const overdueDays = Math.floor(
        (now.getTime() - booking.endTime.getTime()) / DAY_MS,
      );
      await this.bookingsService.notifyStaff(booking.id, {
        kind: 'suspected_lost',
        overdueDays,
      });
      await this.bookingsService.notifyCustomer(booking, {
        kind: 'suspected_lost',
        overdueDays,
      });
    }
    if (flagged) this.logger.log(`Đánh dấu ${flagged} đơn nghi mất thiết bị`);
    return flagged;
  }

  /** Số tiền khi xác nhận mất — dùng cho hộp thoại xem trước của admin. */
  async previewLoss(id: string, now = new Date()) {
    const booking = await this.bookingsService.findByIdOrThrow(id);
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: booking.deviceId },
    });
    const depositAmount = Number(booking.depositAmount);
    const originalPrice = Number(device.originalPrice);
    const debt = calculateLostDeviceDebt({
      originalPrice,
      depositAmount,
      lateFee: calculateLateFee(
        now,
        booking.endTime,
        Number(device.pricePerDay),
        originalPrice,
      ),
    });
    return { depositAmount, originalPrice, deviceName: device.name, ...debt };
  }

  /** Admin xác nhận mất thiết bị (chỉ đơn đang thuê đã bị đánh dấu nghi mất). */
  async confirmLost(
    id: string,
    adminId: string,
    note?: string,
  ): Promise<Booking> {
    const booking = await this.bookingsService.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.ongoing || !booking.suspectedLostAt) {
      throw new BadRequestException(
        `Chỉ xác nhận mất thiết bị cho đơn đang thuê đã quá hạn từ ${LOST_SUSPECT_OVERDUE_DAYS} ngày (đã đánh dấu nghi mất)`,
      );
    }
    const now = new Date();
    const { lateFee, amountOwed, originalPrice, deviceName } =
      await this.previewLoss(id, now);

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: {
          status: BookingStatus.lost,
          lostConfirmedAt: now,
          lateFeeAmount: lateFee,
          amountOwed,
          depositRefundAmount: 0,
          depositRefundStatus: DepositRefundStatus.not_refunded,
        },
      }),
      this.prisma.device.update({
        where: { id: booking.deviceId },
        data: {
          status: DeviceStatus.lost,
          isDiscontinued: true,
          discontinuedAt: now,
        },
      }),
    ]);
    await this.bookingsService.afterDeviceStatusChanged(
      booking.deviceId,
      DeviceStatus.lost,
    );

    // Đưa vào danh sách đen bằng ĐÚNG luồng có sẵn (giữ nguyên hàng user →
    // cccdHash unique tiếp tục chặn đăng ký lại bằng CCCD này).
    const reason = await this.buildBlacklistReason(
      updated,
      deviceName,
      originalPrice,
      amountOwed,
      note,
    );
    try {
      await this.usersService.setBlacklistStatus(
        booking.userId,
        true,
        reason,
        adminId,
      );
    } catch (error) {
      this.logger.warn(
        `Không đưa được khách ${booking.userId} vào danh sách đen: ${(error as Error).message}`,
      );
    }
    await this.bookingsService.notifyCustomer(updated, {
      kind: 'lost',
      amountOwed,
      lateFee,
    });
    return updated;
  }

  /** Lý do danh sách đen kèm bằng chứng: hợp đồng, eKYC, biên bản giao máy. */
  private async buildBlacklistReason(
    booking: Booking,
    deviceName: string,
    originalPrice: number,
    amountOwed: number,
    note?: string,
  ): Promise<string> {
    const [user, handover] = await Promise.all([
      this.usersService.findByIdOrThrow(booking.userId),
      this.prisma.bookingInspection.findUnique({
        where: {
          bookingId_type: {
            bookingId: booking.id,
            type: InspectionType.handover,
          },
        },
      }),
    ]);
    const overdueDays = Math.floor(
      (Date.now() - booking.endTime.getTime()) / DAY_MS,
    );
    const kyc =
      user.kycCccdFrontPublicId &&
      user.kycCccdBackPublicId &&
      user.kycSelfiePublicId
        ? 'đủ ảnh CCCD 2 mặt + chân dung'
        : 'chưa đủ ảnh';
    const code = bookingCode(booking.id);
    return [
      `Không trả thiết bị ${deviceName} (giá trị ${formatVnd(originalPrice)}) — đơn ${code}, quá hạn ${overdueDays} ngày, đã xác nhận mất.`,
      `Cửa hàng giữ cọc ${formatVnd(booking.depositAmount)}, khách còn nợ ${formatVnd(amountOwed)}.`,
      `Bằng chứng: hợp đồng đơn ${code} (${booking.contractSigned ? 'đã ký tay' : 'chưa đánh dấu ký'}), hồ sơ eKYC (CCCD ${user.cccdMasked ?? 'chưa có'}, ${kyc}), biên bản giao máy (${handover ? `${handover.images.length} ảnh` : 'không có'}).`,
      note?.trim() ? `Ghi chú: ${note.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
}
