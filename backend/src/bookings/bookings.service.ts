import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  Booking,
  BookingStatus,
  DeviceStatus,
  Prisma,
  Role,
} from '../generated/prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

export const BOOKING_TTL_QUEUE = 'booking-ttl';
export const BOOKING_TTL_JOB = 'cancel-expired-booking';

const DEPOSIT_RATIO = 0.3;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.pending,
  BookingStatus.confirmed,
  BookingStatus.ongoing,
];

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CancelResult {
  booking: Booking;
  refundPercentage: number;
  refundAmount: string;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue(BOOKING_TTL_QUEUE) private readonly ttlQueue: Queue,
  ) {}

  /**
   * Tạo booking mới — Cơ chế 1 (mục 5 Roadmap): transaction + SELECT ... FOR UPDATE
   * khoá dòng thiết bị trước khi kiểm tra trùng lịch, đảm bảo 2 request cùng lúc
   * cho cùng thiết bị/khung giờ chỉ 1 request thành công. Cơ chế 3 (Exclusion
   * Constraint `no_overlapping_bookings`, đã có từ Tuần 3) là lớp bảo vệ cuối
   * cùng ở tầng DB — được bắt lỗi riêng bên dưới nếu vì lý do nào đó lọt qua.
   */
  async create(userId: string, dto: CreateBookingDto): Promise<Booking> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new BadRequestException(
        'Thời gian kết thúc phải sau thời gian bắt đầu',
      );
    }
    if (startTime < new Date()) {
      throw new BadRequestException(
        'Không thể đặt thuê cho thời gian trong quá khứ',
      );
    }

    const booking = await this.createBookingInTransaction(
      userId,
      dto,
      startTime,
      endTime,
    );

    // Lỗi lên lịch job TTL không nên làm hỏng response tạo booking (booking đã
    // ghi thành công vào DB) — chỉ log cảnh báo, staff vẫn có thể huỷ tay nếu cần.
    try {
      await this.scheduleTtlExpiry(booking.id);
    } catch (error) {
      this.logger.warn(
        `Không lên lịch được job TTL cho booking ${booking.id}: ${(error as Error).message}`,
      );
    }

    return booking;
  }

  private async createBookingInTransaction(
    userId: string,
    dto: CreateBookingDto,
    startTime: Date,
    endTime: Date,
  ): Promise<Booking> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Khoá dòng thiết bị — request khác đặt cùng thiết bị phải ĐỢI tới khi
        // transaction này COMMIT/ROLLBACK (đúng theo mẫu SQL ở mục 5 Roadmap).
        await tx.$queryRaw`SELECT id FROM devices WHERE id::text = ${dto.deviceId} FOR UPDATE`;

        const device = await tx.device.findUnique({
          where: { id: dto.deviceId },
        });
        if (!device) {
          throw new NotFoundException('Không tìm thấy thiết bị');
        }
        if (
          device.status === DeviceStatus.broken ||
          device.status === DeviceStatus.maintenance
        ) {
          throw new BadRequestException(
            'Thiết bị hiện không khả dụng để cho thuê',
          );
        }

        const overlapping = await tx.booking.findFirst({
          where: {
            deviceId: dto.deviceId,
            status: { in: ACTIVE_BOOKING_STATUSES },
            startTime: { lt: endTime },
            endTime: { gt: startTime },
          },
        });
        if (overlapping) {
          throw new ConflictException(
            'Thiết bị đã được đặt trong khung giờ này',
          );
        }

        const totalPrice = this.calculatePrice(
          device.pricePerHour,
          device.pricePerDay,
          startTime,
          endTime,
        );
        const depositAmount = totalPrice * DEPOSIT_RATIO;

        return tx.booking.create({
          data: {
            userId,
            deviceId: dto.deviceId,
            startTime,
            endTime,
            totalPrice,
            depositAmount,
          },
        });
      });
    } catch (error) {
      throw this.translateOverlapError(error);
    }
  }

  async checkAvailability(
    deviceId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    const overlapping = await this.prisma.booking.findFirst({
      where: {
        deviceId,
        status: { in: ACTIVE_BOOKING_STATUSES },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    return !overlapping;
  }

  async findAll(
    currentUser: RequestUser,
    filter: { page: number; limit: number; status?: BookingStatus },
  ): Promise<PaginatedResult<Booking>> {
    const where: Prisma.BookingWhereInput = {
      ...(currentUser.role === Role.customer
        ? { userId: currentUser.userId }
        : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filter.limit)),
      },
    };
  }

  async findByIdOrThrow(id: string): Promise<Booking> {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }
    return booking;
  }

  async findOneForUser(id: string, currentUser: RequestUser): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    this.assertOwnerOrStaff(booking, currentUser);
    return booking;
  }

  /** Staff/admin xác nhận booking đang pending → confirmed, huỷ job TTL tự huỷ. */
  async confirm(id: string): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.pending) {
      throw new BadRequestException(
        `Chỉ có thể xác nhận booking đang ở trạng thái "pending" (hiện tại: "${booking.status}")`,
      );
    }
    await this.cancelTtlExpiry(id);
    return this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.confirmed },
    });
  }

  /** Staff/admin giao thiết bị: confirmed → ongoing. */
  async start(id: string): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.confirmed) {
      throw new BadRequestException(
        `Chỉ có thể bắt đầu booking đang ở trạng thái "confirmed" (hiện tại: "${booking.status}")`,
      );
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.ongoing },
      }),
      this.prisma.device.update({
        where: { id: booking.deviceId },
        data: { status: DeviceStatus.rented },
      }),
    ]);
    return updated;
  }

  /** Staff/admin nhận lại thiết bị: ongoing → completed. */
  async complete(id: string): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.ongoing) {
      throw new BadRequestException(
        `Chỉ có thể hoàn tất booking đang ở trạng thái "ongoing" (hiện tại: "${booking.status}")`,
      );
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.completed },
      }),
      this.prisma.device.update({
        where: { id: booking.deviceId },
        data: { status: DeviceStatus.available },
      }),
    ]);
    return updated;
  }

  /**
   * Huỷ booking + tính % hoàn cọc theo chính sách mục 4.2 Roadmap. Chỉ tính toán
   * chính sách hoàn tiền (chưa xử lý dòng tiền thật — đó là phần việc của module
   * `payments` ở Tuần 7, hiện chưa xây).
   */
  async cancel(
    id: string,
    currentUser: RequestUser,
    dto: CancelBookingDto,
  ): Promise<CancelResult> {
    const booking = await this.findByIdOrThrow(id);
    this.assertOwnerOrStaff(booking, currentUser);

    if (
      booking.status === BookingStatus.completed ||
      booking.status === BookingStatus.cancelled
    ) {
      throw new BadRequestException(
        `Booking đã ở trạng thái cuối ("${booking.status}"), không thể huỷ`,
      );
    }

    const isStaffOrAdmin =
      currentUser.role === Role.staff || currentUser.role === Role.admin;
    const refundPercentage = this.calculateRefundPercentage(
      booking.startTime,
      !!dto.storeFault && isStaffOrAdmin,
    );
    const refundAmount =
      (Number(booking.depositAmount) * refundPercentage) / 100;

    await this.cancelTtlExpiry(id);
    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.cancelled },
    });

    return {
      booking: updated,
      refundPercentage,
      refundAmount: refundAmount.toFixed(2),
    };
  }

  /** Chính sách hoàn cọc — mục 4.2 Roadmap. */
  private calculateRefundPercentage(
    startTime: Date,
    storeFault: boolean,
  ): number {
    if (storeFault) return 100;

    const hoursUntilStart = (startTime.getTime() - Date.now()) / HOUR_MS;
    if (hoursUntilStart >= 24) return 100;
    if (hoursUntilStart >= 6) return 50;
    return 0;
  }

  private calculatePrice(
    pricePerHour: Prisma.Decimal,
    pricePerDay: Prisma.Decimal,
    start: Date,
    end: Date,
  ): number {
    const durationMs = end.getTime() - start.getTime();
    if (durationMs <= DAY_MS) {
      const hours = Math.ceil(durationMs / HOUR_MS);
      return Number(pricePerHour) * hours;
    }
    const days = Math.ceil(durationMs / DAY_MS);
    return Number(pricePerDay) * days;
  }

  private assertOwnerOrStaff(booking: Booking, currentUser: RequestUser): void {
    const isOwner = booking.userId === currentUser.userId;
    const isStaffOrAdmin =
      currentUser.role === Role.staff || currentUser.role === Role.admin;
    if (!isOwner && !isStaffOrAdmin) {
      throw new ForbiddenException('Bạn không có quyền truy cập booking này');
    }
  }

  private async scheduleTtlExpiry(bookingId: string): Promise<void> {
    const ttlMinutes = Number(
      this.configService.get<string>('BOOKING_TTL_MINUTES') ?? 5,
    );
    await this.ttlQueue.add(
      BOOKING_TTL_JOB,
      { bookingId },
      { jobId: bookingId, delay: ttlMinutes * 60 * 1000 },
    );
  }

  private async cancelTtlExpiry(bookingId: string): Promise<void> {
    const job = await this.ttlQueue.getJob(bookingId);
    if (job) {
      await job.remove();
    }
  }

  /** Được gọi bởi BookingTtlProcessor khi job TTL đến hạn. */
  async expireIfStillPending(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) return;
    if (booking.status !== BookingStatus.pending) return;

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.cancelled },
    });
    this.logger.log(`Booking ${bookingId} tự huỷ do quá hạn thanh toán (TTL)`);
  }

  private translateOverlapError(error: unknown): unknown {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('no_overlapping_bookings') ||
      message.includes('23P01')
    ) {
      return new ConflictException('Thiết bị đã được đặt trong khung giờ này');
    }
    return error;
  }
}
