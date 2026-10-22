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
import { DevicesCacheService } from '../devices/devices-cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UsersService } from '../users/users.service';
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
import { BOOKING_TTL_JOB, BOOKING_TTL_QUEUE } from './bookings.constants';

export { BOOKING_TTL_QUEUE, BOOKING_TTL_JOB };

// Tiền cọc = % GIÁ GỐC thiết bị (originalPrice — giá trị tài sản), KHÔNG PHẢI
// % tổng tiền thuê (totalPrice) như cách tính cũ — đổi theo yêu cầu: cọc phải
// phản ánh đúng giá trị tài sản đang giao cho khách giữ, không phụ thuộc thời
// lượng thuê (thuê 1 giờ hay 1 tuần thì rủi ro mất/hỏng thiết bị là như nhau).
const DEPOSIT_RATIO = 0.5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.pending,
  BookingStatus.confirmed,
  BookingStatus.ongoing,
];

// Kèm thông tin thiết bị gọn (tên/ảnh) khi khách xem danh sách/chi tiết booking
// của mình ở frontend — tránh phải gọi thêm N request GET /devices/:id riêng.
const bookingWithDevice = {
  include: {
    device: {
      select: { id: true, name: true, images: true, categoryId: true },
    },
  },
} satisfies Prisma.BookingDefaultArgs;

export type BookingWithDevice = Prisma.BookingGetPayload<
  typeof bookingWithDevice
>;

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
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
    private readonly devicesCacheService: DevicesCacheService,
  ) {}

  /**
   * Tạo booking mới — Cơ chế 1 (mục 5 Roadmap): transaction + SELECT ... FOR UPDATE
   * khoá dòng thiết bị trước khi kiểm tra trùng lịch, đảm bảo 2 request cùng lúc
   * cho cùng thiết bị/khung giờ chỉ 1 request thành công. Cơ chế 3 (Exclusion
   * Constraint `no_overlapping_bookings`, đã có từ Tuần 3) là lớp bảo vệ cuối
   * cùng ở tầng DB — được bắt lỗi riêng bên dưới nếu vì lý do nào đó lọt qua.
   */
  async create(userId: string, dto: CreateBookingDto): Promise<Booking> {
    // Lớp chặn quan trọng nhất của KYC (mục 7 Roadmap): KHÔNG cho đặt thuê nếu
    // hồ sơ chưa có CCCD xác thực — chặn cả user MỚI (lẽ ra không lọt qua vì
    // RegisterDto giờ bắt buộc CCCD) LẪN user CŨ đã tồn tại trong DB trước khi
    // tính năng này ra đời (cccdHash vẫn NULL). Kiểm tra ở đây, KHÔNG chỉ lúc
    // đăng ký, vì đăng ký không phải cổng duy nhất tạo được tài khoản (admin
    // cũng tạo được qua POST /users mà không bắt buộc CCCD).
    const user = await this.usersService.findByIdOrThrow(userId);
    if (!user.cccdHash) {
      throw new BadRequestException(
        'Vui lòng bổ sung số CCCD trong trang Tài khoản của tôi trước khi đặt thuê',
      );
    }
    // Mở rộng KYC (22/10, mục 7 Roadmap): số CCCD thôi không còn đủ — bắt
    // buộc ĐỦ CẢ 3 ảnh eKYC (CCCD mặt trước/sau + ảnh chân dung xác thực)
    // mới cho đặt thuê, giống eKYC ngân hàng. Cùng pattern chặn với cccdHash
    // ở trên — áp dụng cho CẢ user mới lẫn cũ (user cũ có cccdHash nhưng
    // CHƯA nộp 3 ảnh này vẫn bị chặn tới khi họ tự nộp qua /profile).
    if (
      !user.kycCccdFrontPublicId ||
      !user.kycCccdBackPublicId ||
      !user.kycSelfiePublicId
    ) {
      throw new BadRequestException(
        'Vui lòng hoàn tất xác thực danh tính (ảnh CCCD mặt trước/sau + ảnh chân dung) trong trang Tài khoản của tôi trước khi đặt thuê',
      );
    }

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

    // KHÔNG emit realtime ở đây: tạo booking (kể cả pending) không đổi
    // Device.status — thiết bị vẫn "available" cho tới khi staff/admin giao
    // hàng thật (start(), bên dưới). Trùng lịch được chặn bằng transaction +
    // exclusion constraint (mục 5 Roadmap), không phải bằng field status.

    // Lỗi lên lịch job TTL không nên làm hỏng response tạo booking (booking đã
    // ghi thành công vào DB) — chỉ log cảnh báo, staff vẫn có thể huỷ tay nếu cần.
    try {
      await this.scheduleTtlExpiry(booking.id);
    } catch (error) {
      this.logger.warn(
        `Không lên lịch được job TTL cho booking ${booking.id}: ${(error as Error).message}`,
      );
    }

    // Báo cho staff/admin có đơn mới CẦN XÁC NHẬN — KHÔNG loại trừ ai (khác
    // với MaintenanceService.create(), người tạo booking luôn là customer,
    // không thể trùng với người nhận thông báo staff/admin).
    try {
      await this.notificationsService.createForRoles(
        [Role.staff, Role.admin],
        'booking_pending',
        'Có đơn thuê mới đang chờ xác nhận.',
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo đơn mới cho staff/admin (booking ${booking.id}): ${(error as Error).message}`,
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
        const depositAmount = Number(device.originalPrice) * DEPOSIT_RATIO;

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
  ): Promise<PaginatedResult<BookingWithDevice>> {
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
        ...bookingWithDevice,
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

  /** Dùng cho `GET /bookings/:id` — kèm thông tin thiết bị gọn để frontend hiển thị. */
  async findByIdWithDeviceOrThrow(id: string): Promise<BookingWithDevice> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      ...bookingWithDevice,
    });
    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }
    return booking;
  }

  async findOneForUser(
    id: string,
    currentUser: RequestUser,
  ): Promise<BookingWithDevice> {
    const booking = await this.findByIdWithDeviceOrThrow(id);
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
    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.confirmed },
    });

    try {
      await this.notificationsService.create(
        booking.userId,
        'booking_confirmed',
        'Đơn thuê của bạn đã được xác nhận.',
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo xác nhận cho booking ${id}: ${(error as Error).message}`,
      );
    }

    return updated;
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
    this.realtimeGateway.emitDeviceStatusChanged({
      deviceId: booking.deviceId,
      status: DeviceStatus.rented,
    });
    // Cùng điểm emit realtime ở trên — Device.status vừa đổi nên cache danh
    // sách thiết bị (GET /devices) cũng phải xoá ngay, không đợi hết TTL.
    await this.devicesCacheService.invalidateAll();

    try {
      await this.notificationsService.create(
        booking.userId,
        'booking_ongoing',
        'Thiết bị đã được giao — đơn thuê của bạn hiện đang trong thời gian sử dụng.',
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo giao hàng cho booking ${id}: ${(error as Error).message}`,
      );
    }

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
    this.realtimeGateway.emitDeviceStatusChanged({
      deviceId: booking.deviceId,
      status: DeviceStatus.available,
    });
    await this.devicesCacheService.invalidateAll();
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

    // KHÔNG emit realtime ở đây: huỷ booking `pending`/`confirmed` không đổi
    // Device.status (thiết bị chưa từng bị đổi khỏi "available" ở các trạng
    // thái này — chỉ start() mới đổi thành "rented", xem phía trên). Lưu ý
    // NGOÀI PHẠM VI task này: cancel() cũng cho phép huỷ booking `ongoing`
    // (thiết bị đang thật sự "rented") mà không đưa Device.status về lại
    // "available" — đây là khoảng trống nghiệp vụ có sẵn TỪ TRƯỚC (Tuần 6),
    // không phải lỗi phát sinh do thêm realtime, và không thuộc phạm vi Tuần
    // 8 (chỉ thêm WebSocket, không sửa lại state machine booking) nên CHƯA sửa.

    // Hoàn cọc tự động (module payments) — lỗi ở đây không nên làm hỏng response
    // huỷ booking (booking đã huỷ thành công), chỉ log để staff xử lý tay nếu cần.
    try {
      await this.paymentsService.refundForBooking(
        id,
        refundPercentage,
        refundAmount.toFixed(2),
      );
    } catch (error) {
      this.logger.warn(
        `Không xử lý được hoàn cọc tự động cho booking ${id}: ${(error as Error).message}`,
      );
    }

    // Thông báo cho customer BẤT KỂ ai chủ động huỷ (chính họ hay staff/admin)
    // — nếu staff huỷ thay, khách hàng vẫn cần biết ngay, không chỉ khi họ tự
    // bấm huỷ mới biết.
    try {
      await this.notificationsService.create(
        booking.userId,
        'booking_cancelled',
        `Đơn thuê của bạn đã bị huỷ${refundPercentage > 0 ? ` (hoàn ${refundPercentage}% tiền cọc)` : ''}.`,
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo huỷ đơn cho booking ${id}: ${(error as Error).message}`,
      );
    }

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

    try {
      await this.notificationsService.create(
        booking.userId,
        'booking_cancelled',
        'Đơn thuê của bạn đã tự động bị huỷ do quá hạn thanh toán.',
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo tự huỷ (TTL) cho booking ${bookingId}: ${(error as Error).message}`,
      );
    }
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
