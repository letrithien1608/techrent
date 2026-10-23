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
import {
  type BookingNotificationKind,
  buildBookingNotification,
} from '../notifications/notification-templates';
import {
  calculateDeposit,
  calculateLateFee,
  calculateRefundPercentage,
  calculateRentalPrice,
  DEFAULT_BOOKING_TTL_MINUTES,
  HOUR_MS,
} from '../common/business-policy';
import { buildContractContent } from './contract-template.util';

export { BOOKING_TTL_QUEUE, BOOKING_TTL_JOB };

// Các con số chính sách (tỷ lệ cọc, phí trễ hạn leo thang, bậc hoàn cọc, cách
// tính giá) nằm ở common/business-policy.ts — nguồn sự thật dùng chung với mẫu
// hợp đồng và Trợ lý AI.

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
    // Lớp chặn danh sách đen (mục 7 Roadmap, mở rộng 22/10 buổi 6) — kiểm tra
    // TRƯỚC CCCD/KYC (chặn nghiêm trọng nhất, không cần tốn công kiểm tra tiếp
    // nếu user đã bị khoá). "Chặn theo CCCD, không chỉ theo tài khoản" được
    // đảm bảo ở `UsersService.remove()` (không cho xoá user đã blacklist —
    // giữ nguyên hàng đó để cccdHash unique tiếp tục chặn đăng ký lại).
    if (user.isBlacklisted) {
      throw new ForbiddenException(
        'Tài khoản của bạn đã bị đưa vào danh sách đen và không thể đặt thuê. Vui lòng liên hệ cửa hàng để biết thêm chi tiết.',
      );
    }
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
        await this.notificationContent(
          booking.id,
          { kind: 'pending' },
          'staff',
        ),
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
        if (device.isDiscontinued) {
          throw new BadRequestException(
            'Thiết bị này đã ngừng cho thuê, vui lòng chọn thiết bị khác',
          );
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
        const depositAmount = calculateDeposit(Number(device.originalPrice));

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
    filter: {
      page: number;
      limit: number;
      status?: BookingStatus;
      userId?: string;
    },
  ): Promise<PaginatedResult<BookingWithDevice>> {
    // customer LUÔN bị ép lọc theo chính userId của họ — filter.userId (nếu
    // có gửi lên) chỉ có tác dụng với staff/admin, KHÔNG BAO GIỜ cho customer
    // tự chọn xem booking của người khác qua tham số này.
    const where: Prisma.BookingWhereInput = {
      ...(currentUser.role === Role.customer
        ? { userId: currentUser.userId }
        : filter.userId
          ? { userId: filter.userId }
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
  async confirm(id: string, actorId?: string): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.pending) {
      throw new BadRequestException(
        `Chỉ có thể xác nhận booking đang ở trạng thái "pending" (hiện tại: "${booking.status}")`,
      );
    }
    await this.cancelTtlExpiry(id);
    const updated = await this.prisma.booking.update({
      where: { id },
      data: { status: BookingStatus.confirmed, confirmedById: actorId ?? null },
    });

    try {
      await this.notificationsService.create(
        booking.userId,
        await this.notificationContent(id, { kind: 'confirmed' }, 'customer'),
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo xác nhận cho booking ${id}: ${(error as Error).message}`,
      );
    }

    // Sinh hợp đồng ngay khi booking được xác nhận — lỗi ở đây KHÔNG được làm
    // hỏng việc confirm (cùng pattern try/catch với TTL/notification ở trên).
    // Admin vẫn có thể bấm lại "Xem/In hợp đồng" sau nếu bước này lỗi tạm thời,
    // vì getContractForPrint() tự sinh lại nội dung mỗi lần gọi, không phụ
    // thuộc việc contractContent đã được lưu từ bước này hay chưa.
    try {
      await this.generateAndSaveContract(updated);
    } catch (error) {
      this.logger.warn(
        `Không sinh được hợp đồng cho booking ${id}: ${(error as Error).message}`,
      );
    }

    return updated;
  }

  /**
   * Sinh nội dung hợp đồng (CCCD dạng MASKED, an toàn để lưu lâu dài trong DB)
   * và lưu vào `Booking.contractContent`. Gọi từ CẢ 2 đường dẫn tới trạng thái
   * `confirmed` — `confirm()` ở trên VÀ `PaymentsService.confirmBookingAfterPayment()`
   * (xem file đó — lặp lại logic này vì 2 module không import chéo nhau, đúng
   * nguyên tắc kiến trúc 1 chiều Payments→Bookings đã có từ Tuần 7).
   */
  private async generateAndSaveContract(booking: Booking): Promise<void> {
    const [device, user] = await Promise.all([
      this.prisma.device.findUniqueOrThrow({
        where: { id: booking.deviceId },
      }),
      this.usersService.findByIdOrThrow(booking.userId),
    ]);
    const content = buildContractContent({
      bookingId: booking.id,
      createdAt: booking.createdAt,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalPrice: Number(booking.totalPrice),
      depositAmount: Number(booking.depositAmount),
      customerName: user.name,
      customerCccd: user.cccdMasked ?? '(chưa có trong hồ sơ)',
      customerPhone: user.phone,
      deviceName: device.name,
      deviceCondition: device.detailedDescription,
      deviceOriginalPrice: Number(device.originalPrice),
      devicePricePerDay: Number(device.pricePerDay),
    });
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { contractContent: content },
    });
  }

  /**
   * Sinh bản hợp đồng để IN — CCCD giải mã ĐẦY ĐỦ (khác bản lưu trong
   * `contractContent`, luôn là bản masked). Hợp đồng in ra giấy cho khách ký
   * tay cần đúng số CCCD để có giá trị pháp lý — khác mục đích hiển thị trên
   * web (chỉ cần masked). KHÔNG BAO GIỜ lưu lại bản đầy đủ này, chỉ sinh tạm
   * mỗi lần gọi — admin/staff only (xem `@Roles` ở controller).
   */
  async getContractForPrint(id: string): Promise<{
    content: string;
    signed: boolean;
    signedAt: Date | null;
  }> {
    const booking = await this.findByIdOrThrow(id);
    const [device, user] = await Promise.all([
      this.prisma.device.findUniqueOrThrow({
        where: { id: booking.deviceId },
      }),
      this.usersService.findByIdOrThrow(booking.userId),
    ]);
    const encryptionKey = this.configService.get<string>('CCCD_ENCRYPTION_KEY');
    const fullCccd = await this.usersService.revealCccd(
      booking.userId,
      encryptionKey!,
    );
    const content = buildContractContent({
      bookingId: booking.id,
      createdAt: booking.createdAt,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalPrice: Number(booking.totalPrice),
      depositAmount: Number(booking.depositAmount),
      customerName: user.name,
      customerCccd: fullCccd,
      customerPhone: user.phone,
      deviceName: device.name,
      deviceCondition: device.detailedDescription,
      deviceOriginalPrice: Number(device.originalPrice),
      devicePricePerDay: Number(device.pricePerDay),
    });
    return {
      content,
      signed: booking.contractSigned,
      signedAt: booking.contractSignedAt,
    };
  }

  /** Nhân viên đánh dấu đã/chưa ký tay — KHÔNG lưu ảnh hợp đồng đã ký (ngoài phạm vi). */
  async setContractSigned(id: string, signed: boolean): Promise<Booking> {
    await this.findByIdOrThrow(id);
    return this.prisma.booking.update({
      where: { id },
      data: {
        contractSigned: signed,
        contractSignedAt: signed ? new Date() : null,
      },
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
        await this.notificationContent(id, { kind: 'ongoing' }, 'customer'),
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo giao hàng cho booking ${id}: ${(error as Error).message}`,
      );
    }

    return updated;
  }

  /**
   * Staff/admin nhận lại thiết bị: ongoing → completed. Nếu trả SAU `endTime`
   * dự kiến, tự tính phí trễ hạn leo thang (xem `calculateLateFee()`) — cộng
   * thẳng vào `totalPrice` (giữ đúng ý nghĩa "tổng tiền phải trả") NHƯNG lưu
   * riêng ở `lateFeeAmount` để khách/admin thấy rõ đây là phần phạt, không
   * lẫn vào tiền thuê gốc.
   */
  async complete(id: string): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.ongoing) {
      throw new BadRequestException(
        `Chỉ có thể hoàn tất booking đang ở trạng thái "ongoing" (hiện tại: "${booking.status}")`,
      );
    }

    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: booking.deviceId },
    });
    const lateFeeAmount = calculateLateFee(
      new Date(),
      booking.endTime,
      Number(device.pricePerDay),
      Number(device.originalPrice),
    );
    const totalPrice = Number(booking.totalPrice) + lateFeeAmount;

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: { status: BookingStatus.completed, lateFeeAmount, totalPrice },
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
    const reason = dto.reason?.trim() || null;
    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.cancelled,
        cancelledById: currentUser.userId,
        cancellationReason: reason,
      },
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
      // Đơn còn "pending" thì chưa thu cọc — không nhắc hoàn tiền cho khỏi hiểu nhầm.
      const depositCollected = booking.status !== BookingStatus.pending;
      await this.notificationsService.create(
        booking.userId,
        await this.notificationContent(
          id,
          {
            kind: 'cancelled',
            byStore: isStaffOrAdmin && booking.userId !== currentUser.userId,
            reason,
            refundPercentage: depositCollected ? refundPercentage : 0,
            refundAmount: depositCollected ? refundAmount : 0,
          },
          'customer',
        ),
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

  /** Chính sách hoàn cọc — mục 4.2 Roadmap, bậc % nằm ở business-policy.ts. */
  private calculateRefundPercentage(
    startTime: Date,
    storeFault: boolean,
  ): number {
    return calculateRefundPercentage(
      (startTime.getTime() - Date.now()) / HOUR_MS,
      storeFault,
    );
  }

  private calculatePrice(
    pricePerHour: Prisma.Decimal,
    pricePerDay: Prisma.Decimal,
    start: Date,
    end: Date,
  ): number {
    return calculateRentalPrice(
      Number(pricePerHour),
      Number(pricePerDay),
      start,
      end,
    );
  }

  private assertOwnerOrStaff(booking: Booking, currentUser: RequestUser): void {
    const isOwner = booking.userId === currentUser.userId;
    const isStaffOrAdmin =
      currentUser.role === Role.staff || currentUser.role === Role.admin;
    if (!isOwner && !isStaffOrAdmin) {
      throw new ForbiddenException('Bạn không có quyền truy cập booking này');
    }
  }

  /** Nạp booking kèm thiết bị + tên khách rồi dựng nội dung thông báo (notification-templates.ts). */
  private async notificationContent(
    bookingId: string,
    event: BookingNotificationKind,
    audience: 'customer' | 'staff',
  ) {
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        device: { select: { id: true, name: true, images: true } },
        user: { select: { name: true } },
      },
    });
    return buildBookingNotification(booking, event, audience);
  }

  private async scheduleTtlExpiry(bookingId: string): Promise<void> {
    const ttlMinutes = Number(
      this.configService.get<string>('BOOKING_TTL_MINUTES') ??
        DEFAULT_BOOKING_TTL_MINUTES,
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
        await this.notificationContent(
          bookingId,
          { kind: 'expired' },
          'customer',
        ),
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
