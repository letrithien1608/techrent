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
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';
import {
  Booking,
  BookingStatus,
  DepositRefundStatus,
  DeviceCondition,
  DeviceStatus,
  InspectionType,
  IssueReportStatus,
  Prisma,
  RentalPaymentMethod,
  Role,
} from '../generated/prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfirmReturnDto } from './dto/confirm-return.dto';
import { BOOKING_TTL_JOB, BOOKING_TTL_QUEUE } from './bookings.constants';
import {
  type BookingNotificationKind,
  buildBookingNotification,
  formatVnd,
} from '../notifications/notification-templates';
import {
  calculateDeposit,
  calculateDepositSettlement,
  calculateLateFee,
  calculateRefundPercentage,
  calculateRentalPrice,
  DEFAULT_BOOKING_TTL_MINUTES,
  depositRefundDueAt,
  HANDOVER_MIN_PHOTOS,
  HOUR_MS,
  RETURN_DAMAGE_MIN_PHOTOS,
} from '../common/business-policy';
import { ContractService } from './contract/contract.service';

export { BOOKING_TTL_QUEUE, BOOKING_TTL_JOB };

// Các con số chính sách (tỷ lệ cọc, phí trễ hạn leo thang, bậc hoàn cọc, cách
// tính giá) nằm ở common/business-policy.ts — nguồn sự thật dùng chung với mẫu
// hợp đồng và Trợ lý AI.

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.pending,
  BookingStatus.confirmed,
  BookingStatus.ongoing,
];

// Hợp đồng sinh ở mốc xác nhận → khách xem được từ `confirmed` trở đi.
const CONTRACT_VISIBLE_STATUSES: BookingStatus[] = [
  BookingStatus.confirmed,
  BookingStatus.ongoing,
  BookingStatus.completed,
  BookingStatus.lost,
];

// Kèm thông tin thiết bị gọn (tên/ảnh) khi khách xem danh sách/chi tiết booking
// của mình ở frontend — tránh phải gọi thêm N request GET /devices/:id riêng.
const bookingWithDevice = {
  include: {
    device: {
      select: { id: true, name: true, images: true, categoryId: true },
    },
    // Tên + SĐT khách: nhân viên cần để liên hệ hoàn cọc. Khách chỉ xem được
    // đơn của chính mình nên không lộ thông tin người khác.
    user: { select: { id: true, name: true, phone: true } },
  },
} satisfies Prisma.BookingDefaultArgs;

export type BookingWithDevice = Prisma.BookingGetPayload<
  typeof bookingWithDevice
>;

// Chi tiết 1 đơn: thêm biên bản giao/nhận máy (ảnh đối chiếu + tình trạng).
const bookingDetail = {
  include: {
    ...bookingWithDevice.include,
    inspections: { orderBy: { createdAt: 'asc' } },
    issueReports: { orderBy: { createdAt: 'asc' } },
    debtPayments: { orderBy: { createdAt: 'asc' } },
  },
} satisfies Prisma.BookingDefaultArgs;

export type BookingDetail = Prisma.BookingGetPayload<typeof bookingDetail>;

/** File ảnh nhận từ Multer memory storage. */
export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

const CONDITION_LABEL: Record<DeviceCondition, string> = {
  intact: 'Nguyên vẹn',
  damaged: 'Hư hỏng',
  missing_accessories: 'Thiếu phụ kiện',
};

export interface FinancialStats {
  /** Tiền thuê đã thu tại quầy (trừ phần đã hoàn khi kết thúc sớm). */
  rentalRevenue: number;
  /** Phí trễ hạn đã khấu trừ (trả máy / mất máy). */
  lateFees: number;
  /** Phí hư hỏng/thiếu phụ kiện + chi phí sửa do lỗi của khách. */
  damageFees: number;
  /** Tiền cọc cửa hàng đang giữ (đơn đang hiệu lực + khoản chờ hoàn). */
  depositHeld: number;
  /** Tiền khách còn nợ chưa thu. */
  outstandingDebt: number;
  /** Tiền nợ đã thu. */
  debtCollected: number;
  pendingRefundCount: number;
  overdueRefundCount: number;
  /** Đơn đang thuê bị đánh dấu nghi mất (quá hạn lâu, chờ admin xác nhận). */
  suspectedLostCount: number;
  lostDeviceCount: number;
  openIssueCount: number;
}

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
    private readonly uploadService: UploadService,
    private readonly contractService: ContractService,
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
    // Còn nợ (quyết toán trả máy âm hoặc mất thiết bị) → phải thanh toán hết
    // tại cửa hàng trước khi đặt thuê mới.
    const outstandingDebt = await this.getOutstandingDebt(userId);
    if (outstandingDebt > 0) {
      throw new ForbiddenException(
        `Bạn còn nợ ${formatVnd(outstandingDebt)} từ đơn thuê trước. Vui lòng thanh toán tại cửa hàng trước khi đặt thuê mới.`,
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

  /** Tổng nợ còn lại của 1 khách = Σ(amountOwed − debtPaidAmount). */
  async getOutstandingDebt(userId: string): Promise<number> {
    const sums = await this.prisma.booking.aggregate({
      where: { userId, amountOwed: { gt: 0 } },
      _sum: { amountOwed: true, debtPaidAmount: true },
    });
    return Math.max(
      Number(sums._sum.amountOwed ?? 0) - Number(sums._sum.debtPaidAmount ?? 0),
      0,
    );
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
      depositRefundStatus?: DepositRefundStatus;
      excludeDemo?: boolean;
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
      ...(filter.depositRefundStatus
        ? { depositRefundStatus: filter.depositRefundStatus }
        : {}),
      ...(filter.excludeDemo ? { isDemo: false } : {}),
    };
    // Danh sách chờ hoàn cọc: hạn gần nhất (hoặc đã quá hạn) lên đầu.
    const orderBy: Prisma.BookingOrderByWithRelationInput =
      filter.depositRefundStatus === DepositRefundStatus.pending
        ? { depositRefundDueAt: 'asc' }
        : { createdAt: 'desc' };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy,
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

  /** Dùng cho `GET /bookings/:id` — kèm thiết bị gọn + biên bản giao/nhận máy. */
  async findByIdWithDeviceOrThrow(id: string): Promise<BookingDetail> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      ...bookingDetail,
    });
    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }
    return booking;
  }

  async findOneForUser(
    id: string,
    currentUser: RequestUser,
  ): Promise<BookingDetail> {
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

    await this.refreshContractSnapshot(id);
    return updated;
  }

  /**
   * Lưu bản hợp đồng (CCCD CHE) vào `Booking.contractContent` ở các mốc xác
   * nhận, giao máy, trả máy, đổi máy — lỗi KHÔNG làm hỏng thao tác chính (trang
   * in/PDF luôn dựng lại hợp đồng mới nhất mỗi lần gọi).
   */
  async refreshContractSnapshot(bookingId: string): Promise<void> {
    try {
      await this.contractService.saveSnapshot(bookingId);
    } catch (error) {
      this.logger.warn(
        `Không lưu được bản hợp đồng cho booking ${bookingId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Bản hợp đồng để xem/in/tải PDF — CCCD ĐẦY ĐỦ (giấy ký tay cần đúng số
   * CCCD), sinh tạm mỗi lần gọi, KHÔNG lưu lại; chỉ staff/admin (`@Roles`).
   */
  async getContractForPrint(
    id: string,
    actorId: string,
  ): Promise<{ html: string; signed: boolean; signedAt: Date | null }> {
    const booking = await this.findByIdOrThrow(id);
    const html = await this.contractService.renderForPrint(id, actorId);
    return {
      html,
      signed: booking.contractSigned,
      signedAt: booking.contractSignedAt,
    };
  }

  getContractPdf(id: string, actorId: string): Promise<Buffer> {
    return this.contractService.renderPdf(id, actorId);
  }

  /**
   * Chủ đơn xem/tải hợp đồng của CHÍNH đơn mình — CCCD CHE, cùng hàm dựng
   * HTML/PDF với bản nhân viên. Chỉ từ khi đơn đã xác nhận (pending/huỷ
   * không có hợp đồng); người khác (kể cả staff qua đường này) → 403.
   */
  async getOwnContract(
    id: string,
    currentUser: RequestUser,
  ): Promise<{ html: string; signed: boolean; signedAt: Date | null }> {
    const booking = await this.assertOwnContractAccess(id, currentUser);
    const html = await this.contractService.renderForPrint(id, undefined, {
      fullCccd: false,
    });
    return {
      html,
      signed: booking.contractSigned,
      signedAt: booking.contractSignedAt,
    };
  }

  async getOwnContractPdf(
    id: string,
    currentUser: RequestUser,
  ): Promise<Buffer> {
    await this.assertOwnContractAccess(id, currentUser);
    return this.contractService.renderPdf(id, undefined, { fullCccd: false });
  }

  private async assertOwnContractAccess(
    id: string,
    currentUser: RequestUser,
  ): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.userId !== currentUser.userId) {
      throw new ForbiddenException('Bạn không có quyền xem hợp đồng này');
    }
    if (!CONTRACT_VISIBLE_STATUSES.includes(booking.status)) {
      throw new BadRequestException(
        'Hợp đồng chỉ có sau khi đơn được xác nhận',
      );
    }
    return booking;
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

  /**
   * Biên bản giao máy: nhân viên chụp tối thiểu HANDOVER_MIN_PHOTOS ảnh tình
   * trạng thiết bị + ghi chú (trầy xước, phụ kiện kèm theo). Lập lại được
   * (chụp lại) chừng nào đơn còn `confirmed` — bản mới thay bản cũ.
   */
  async recordHandover(
    id: string,
    actorId: string,
    files: UploadedImage[],
    notes?: string,
  ): Promise<BookingDetail> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.confirmed) {
      throw new BadRequestException(
        'Chỉ lập biên bản giao máy cho đơn đã xác nhận, chưa giao máy',
      );
    }
    if (files.length < HANDOVER_MIN_PHOTOS) {
      throw new BadRequestException(
        `Biên bản giao máy cần tối thiểu ${HANDOVER_MIN_PHOTOS} ảnh tình trạng thiết bị`,
      );
    }
    const images = await this.uploadService.uploadInspectionImages(
      files,
      id,
      InspectionType.handover,
    );
    const data = {
      images,
      notes: notes?.trim() || null,
      condition: DeviceCondition.intact,
      performedById: actorId,
    };
    await this.prisma.bookingInspection.upsert({
      where: {
        bookingId_type: { bookingId: id, type: InspectionType.handover },
      },
      create: { bookingId: id, type: InspectionType.handover, ...data },
      update: { ...data, createdAt: new Date() },
    });
    return this.findByIdWithDeviceOrThrow(id);
  }

  /** Nhân viên thu tiền thuê tại quầy (tiền mặt/chuyển khoản) khi giao máy. */
  async recordRentalPayment(
    id: string,
    actorId: string,
    method: RentalPaymentMethod,
  ): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.confirmed) {
      throw new BadRequestException(
        'Chỉ thu tiền thuê cho đơn đã xác nhận, chưa giao máy',
      );
    }
    if (booking.rentalPaid) {
      throw new BadRequestException('Đơn này đã thu tiền thuê');
    }
    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        rentalPaid: true,
        rentalPaidAt: new Date(),
        rentalPaymentMethod: method,
        rentalCollectedById: actorId,
      },
    });
    await this.notifyCustomer(booking, { kind: 'rental_paid', method });
    return updated;
  }

  /**
   * Staff/admin giao thiết bị: confirmed → ongoing. Chỉ cho phép khi đã đủ 3
   * điều kiện tại quầy: thu tiền thuê, khách ký hợp đồng, có biên bản giao máy.
   */
  async start(id: string): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.confirmed) {
      throw new BadRequestException(
        `Chỉ có thể bắt đầu booking đang ở trạng thái "confirmed" (hiện tại: "${booking.status}")`,
      );
    }
    const handover = await this.prisma.bookingInspection.findUnique({
      where: {
        bookingId_type: { bookingId: id, type: InspectionType.handover },
      },
    });
    const missing = [
      !booking.rentalPaid && 'chưa thu tiền thuê',
      !booking.contractSigned && 'khách chưa ký hợp đồng',
      !handover && 'chưa lập biên bản giao máy',
    ].filter((item): item is string => !!item);
    if (missing.length) {
      throw new BadRequestException(`Chưa thể giao máy: ${missing.join(', ')}`);
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
    await this.afterDeviceStatusChanged(booking.deviceId, DeviceStatus.rented);
    await this.notifyCustomer(booking, { kind: 'ongoing' });
    await this.refreshContractSnapshot(id);
    return updated;
  }

  /**
   * Nhân viên xác nhận trả máy (ongoing → completed) — thay cho "Hoàn tất" cũ.
   * Ghi biên bản nhận lại máy (tình trạng + ảnh), tự tính phí trễ hạn leo
   * thang và quyết toán cọc: hoàn = cọc − phí trễ hạn − phí hư hỏng; âm thì
   * hoàn 0 và lưu phần thiếu vào `amountOwed`. Máy hư hỏng/thiếu phụ kiện
   * chuyển sang bảo trì (kèm phiếu bảo trì) thay vì cho thuê lại ngay.
   */
  async confirmReturn(
    id: string,
    actorId: string,
    dto: ConfirmReturnDto,
    files: UploadedImage[],
  ): Promise<BookingDetail> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.status !== BookingStatus.ongoing) {
      throw new BadRequestException(
        `Chỉ xác nhận trả máy cho đơn đang thuê (hiện tại: "${booking.status}")`,
      );
    }
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: booking.deviceId },
    });

    const intact = dto.condition === DeviceCondition.intact;
    const damageFee = intact ? 0 : (dto.damageFee ?? 0);
    const damageDescription = dto.damageDescription?.trim() || null;
    if (!intact) {
      if (!damageDescription) {
        throw new BadRequestException(
          'Vui lòng mô tả hư hỏng hoặc phụ kiện bị thiếu',
        );
      }
      if (damageFee <= 0) {
        throw new BadRequestException('Vui lòng nhập số tiền bồi thường');
      }
      if (files.length < RETURN_DAMAGE_MIN_PHOTOS) {
        throw new BadRequestException(
          `Cần tối thiểu ${RETURN_DAMAGE_MIN_PHOTOS} ảnh minh chứng hư hỏng/thiếu phụ kiện`,
        );
      }
    }
    if (damageFee > Number(device.originalPrice)) {
      throw new BadRequestException(
        'Số tiền bồi thường không được vượt quá giá trị thiết bị',
      );
    }

    const returnedAt = new Date();
    const lateFee = calculateLateFee(
      returnedAt,
      booking.endTime,
      Number(device.pricePerDay),
      Number(device.originalPrice),
    );
    const settlement = calculateDepositSettlement({
      depositAmount: Number(booking.depositAmount),
      lateFee,
      damageFee,
      repairFee: Number(booking.repairFeeAmount ?? 0),
    });
    const images = files.length
      ? await this.uploadService.uploadInspectionImages(
          files,
          id,
          InspectionType.return,
        )
      : [];
    const nextDeviceStatus = intact
      ? DeviceStatus.available
      : DeviceStatus.maintenance;
    const hasRefund = settlement.refundAmount > 0;

    await this.prisma.$transaction([
      this.prisma.bookingInspection.create({
        data: {
          bookingId: id,
          type: InspectionType.return,
          images,
          notes: dto.notes?.trim() || null,
          condition: dto.condition,
          damageDescription,
          performedById: actorId,
        },
      }),
      this.prisma.booking.update({
        where: { id },
        data: {
          status: BookingStatus.completed,
          returnedAt,
          lateFeeAmount: lateFee,
          damageFeeAmount: damageFee,
          amountOwed: settlement.amountOwed,
          depositRefundAmount: settlement.refundAmount,
          depositRefundStatus: hasRefund
            ? DepositRefundStatus.pending
            : DepositRefundStatus.not_refunded,
          depositRefundDueAt: hasRefund ? depositRefundDueAt(returnedAt) : null,
        },
      }),
      this.prisma.device.update({
        where: { id: booking.deviceId },
        data: { status: nextDeviceStatus },
      }),
      ...(intact
        ? []
        : [
            this.prisma.maintenance.create({
              data: {
                deviceId: booking.deviceId,
                reportedBy: actorId,
                issue: `Trả máy – ${CONDITION_LABEL[dto.condition]}: ${damageDescription}`,
              },
            }),
          ]),
    ]);
    await this.afterDeviceStatusChanged(booking.deviceId, nextDeviceStatus);
    await this.notifyCustomer(booking, {
      kind: 'returned',
      lateFee,
      damageFee,
      refundAmount: settlement.refundAmount,
      amountOwed: settlement.amountOwed,
    });
    await this.refreshContractSnapshot(id);
    return this.findByIdWithDeviceOrThrow(id);
  }

  /**
   * Xem trước quyết toán cọc nếu nhận lại máy NGAY BÂY GIỜ — form "Xác nhận
   * trả máy" gọi để hiện bảng khấu trừ bằng đúng công thức của backend.
   */
  async previewReturn(
    id: string,
    damageFee = 0,
  ): Promise<{
    depositAmount: number;
    lateFee: number;
    damageFee: number;
    repairFee: number;
    totalDeductions: number;
    refundAmount: number;
    amountOwed: number;
  }> {
    const booking = await this.findByIdOrThrow(id);
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: booking.deviceId },
    });
    const lateFee = calculateLateFee(
      new Date(),
      booking.endTime,
      Number(device.pricePerDay),
      Number(device.originalPrice),
    );
    const depositAmount = Number(booking.depositAmount);
    const repairFee = Number(booking.repairFeeAmount ?? 0);
    return {
      depositAmount,
      lateFee,
      damageFee,
      repairFee,
      ...calculateDepositSettlement({
        depositAmount,
        lateFee,
        damageFee,
        repairFee,
      }),
    };
  }

  /**
   * Nhân viên đã chuyển khoản hoàn cọc thủ công: pending → refunded, lưu mã
   * giao dịch, đánh dấu Payment VNPay tương ứng là `refunded`, báo khách realtime.
   */
  async markDepositRefunded(
    id: string,
    actorId: string,
    transactionRef: string,
  ): Promise<Booking> {
    const booking = await this.findByIdOrThrow(id);
    if (booking.depositRefundStatus !== DepositRefundStatus.pending) {
      throw new BadRequestException('Đơn này không có khoản cọc đang chờ hoàn');
    }
    const txnRef = transactionRef.trim();
    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        depositRefundStatus: DepositRefundStatus.refunded,
        depositRefundedAt: new Date(),
        depositRefundTxnRef: txnRef,
        depositRefundedById: actorId,
      },
    });
    try {
      await this.paymentsService.markDepositPaymentRefunded(id);
    } catch (error) {
      this.logger.warn(
        `Không cập nhật được trạng thái thanh toán cọc cho booking ${id}: ${(error as Error).message}`,
      );
    }
    await this.notifyCustomer(booking, {
      kind: 'deposit_refunded',
      // Gồm cả tiền thuê hoàn lại khi kết thúc sớm do lỗi thiết bị (chuyển cùng lúc).
      amount:
        Number(booking.depositRefundAmount) +
        Number(booking.rentalRefundAmount ?? 0),
      transactionRef: txnRef,
    });
    return updated;
  }

  /**
   * Thống kê tài chính cho Dashboard — tổng hợp bằng SQL trên TOÀN BỘ đơn
   * (không bị giới hạn 100 đơn như cách tính phía client trước đây), tách
   * riêng tiền thuê / phí trễ hạn / phí hư hỏng / tiền cọc đang giữ.
   */
  async getFinancialStats(now = new Date()): Promise<FinancialStats> {
    // Mọi số liệu tiền bỏ qua đơn dữ liệu mẫu (isDemo) để dùng được cho báo cáo.
    const real = { isDemo: false };
    const pendingRefund = {
      ...real,
      depositRefundStatus: DepositRefundStatus.pending,
    };
    const [
      rental,
      settled,
      heldActive,
      heldPending,
      debt,
      pending,
      overdue,
      suspectedLost,
      lostDevices,
      openIssues,
    ] = await this.prisma.$transaction([
      this.prisma.booking.aggregate({
        where: { ...real, rentalPaid: true },
        _sum: { totalPrice: true, rentalRefundAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: {
          ...real,
          status: { in: [BookingStatus.completed, BookingStatus.lost] },
        },
        _sum: {
          lateFeeAmount: true,
          damageFeeAmount: true,
          repairFeeAmount: true,
        },
      }),
      this.prisma.booking.aggregate({
        where: {
          ...real,
          status: { in: [BookingStatus.confirmed, BookingStatus.ongoing] },
        },
        _sum: { depositAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: pendingRefund,
        _sum: { depositRefundAmount: true },
      }),
      this.prisma.booking.aggregate({
        where: { ...real, amountOwed: { gt: 0 } },
        _sum: { amountOwed: true, debtPaidAmount: true },
      }),
      this.prisma.booking.count({ where: pendingRefund }),
      this.prisma.booking.count({
        where: { ...pendingRefund, depositRefundDueAt: { lt: now } },
      }),
      this.prisma.booking.count({
        where: {
          ...real,
          status: BookingStatus.ongoing,
          suspectedLostAt: { not: null },
        },
      }),
      this.prisma.device.count({ where: { status: DeviceStatus.lost } }),
      this.prisma.deviceIssueReport.count({
        where: { status: IssueReportStatus.open },
      }),
    ]);
    return {
      rentalRevenue:
        Number(rental._sum.totalPrice ?? 0) -
        Number(rental._sum.rentalRefundAmount ?? 0),
      lateFees: Number(settled._sum.lateFeeAmount ?? 0),
      damageFees:
        Number(settled._sum.damageFeeAmount ?? 0) +
        Number(settled._sum.repairFeeAmount ?? 0),
      depositHeld:
        Number(heldActive._sum.depositAmount ?? 0) +
        Number(heldPending._sum.depositRefundAmount ?? 0),
      outstandingDebt:
        Number(debt._sum.amountOwed ?? 0) -
        Number(debt._sum.debtPaidAmount ?? 0),
      debtCollected: Number(debt._sum.debtPaidAmount ?? 0),
      pendingRefundCount: pending,
      overdueRefundCount: overdue,
      suspectedLostCount: suspectedLost,
      lostDeviceCount: lostDevices,
      openIssueCount: openIssues,
    };
  }

  /** Mọi thay đổi Device.status: phát realtime + xoá cache danh sách thiết bị. */
  async afterDeviceStatusChanged(
    deviceId: string,
    status: DeviceStatus,
  ): Promise<void> {
    this.realtimeGateway.emitDeviceStatusChanged({ deviceId, status });
    await this.devicesCacheService.invalidateAll();
  }

  /** Thông báo cho khách — lỗi tạo thông báo không làm hỏng thao tác chính. */
  async notifyCustomer(
    booking: Booking,
    event: BookingNotificationKind,
  ): Promise<void> {
    try {
      await this.notificationsService.create(
        booking.userId,
        await this.notificationContent(booking.id, event, 'customer'),
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo "${event.kind}" cho booking ${booking.id}: ${(error as Error).message}`,
      );
    }
  }

  /** Thông báo cho mọi staff/admin — lỗi không làm hỏng thao tác chính. */
  async notifyStaff(
    bookingId: string,
    event: BookingNotificationKind,
  ): Promise<void> {
    try {
      await this.notificationsService.createForRoles(
        [Role.staff, Role.admin],
        await this.notificationContent(bookingId, event, 'staff'),
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo "${event.kind}" cho staff/admin (booking ${bookingId}): ${(error as Error).message}`,
      );
    }
  }

  /**
   * Huỷ booking + tính % hoàn cọc theo chính sách (bậc % ở business-policy.ts).
   * Cọc đã thu thì KHÔNG đánh dấu hoàn ngay: đặt trạng thái "chờ hoàn" kèm hạn
   * DEPOSIT_REFUND_BUSINESS_DAYS ngày làm việc — nhân viên chuyển khoản thủ
   * công rồi bấm "Đã hoàn cọc" (markDepositRefunded). Huỷ đơn đang thuê chỉ
   * staff/admin được làm và giải phóng thiết bị về "available".
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
    // Khách đang giữ máy không được tự huỷ đơn (sẽ "trả" máy trên giấy mà
    // không qua bước nhận lại máy tại quầy).
    if (booking.status === BookingStatus.ongoing && !isStaffOrAdmin) {
      throw new ForbiddenException(
        'Đơn đang thuê không thể tự huỷ — vui lòng mang máy đến cửa hàng để trả',
      );
    }
    const refundPercentage = this.calculateRefundPercentage(
      booking.startTime,
      !!dto.storeFault && isStaffOrAdmin,
    );
    // Đơn còn "pending" thì chưa thu cọc — không có gì để hoàn.
    const depositCollected = booking.status !== BookingStatus.pending;
    const refundAmount = depositCollected
      ? (Number(booking.depositAmount) * refundPercentage) / 100
      : 0;
    const now = new Date();

    await this.cancelTtlExpiry(id);
    const reason = dto.reason?.trim() || null;
    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: BookingStatus.cancelled,
        cancelledById: currentUser.userId,
        cancellationReason: reason,
        ...(depositCollected
          ? {
              depositRefundAmount: refundAmount,
              depositRefundStatus:
                refundAmount > 0
                  ? DepositRefundStatus.pending
                  : DepositRefundStatus.not_refunded,
              depositRefundDueAt:
                refundAmount > 0 ? depositRefundDueAt(now) : null,
            }
          : {}),
      },
    });

    // Huỷ đơn đang thuê (thiết bị đang "rented") phải trả thiết bị về
    // "available". Huỷ pending/confirmed không đổi Device.status.
    if (booking.status === BookingStatus.ongoing) {
      await this.prisma.device.update({
        where: { id: booking.deviceId },
        data: { status: DeviceStatus.available },
      });
      await this.afterDeviceStatusChanged(
        booking.deviceId,
        DeviceStatus.available,
      );
    }

    // Thông báo cho customer BẤT KỂ ai chủ động huỷ (chính họ hay staff/admin).
    await this.notifyCustomer(booking, {
      kind: 'cancelled',
      byStore: isStaffOrAdmin && booking.userId !== currentUser.userId,
      reason,
      refundPercentage: depositCollected ? refundPercentage : 0,
      refundAmount,
    });

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
