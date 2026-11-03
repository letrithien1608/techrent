import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '../generated/prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { BOOKING_TTL_QUEUE } from '../bookings/bookings.constants';
import { buildContractContent } from '../bookings/contract-template.util';
import { buildBookingNotification } from '../notifications/notification-templates';
import { NotificationsService } from '../notifications/notifications.service';
import {
  formatVnpayDate,
  signVnpayParams,
  verifyVnpaySignature,
} from './vnpay.util';

export interface VnpayIpnResult {
  RspCode: string;
  Message: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    // Không phụ thuộc trực tiếp vào BookingsService (tránh vòng lặp module
    // BookingsModule <-> PaymentsModule) — inject thẳng cùng queue TTL để tự huỷ
    // job khi thanh toán thành công, chỉ lặp lại vài dòng thay vì import chéo module.
    @InjectQueue(BOOKING_TTL_QUEUE) private readonly ttlQueue: Queue,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Tạo URL thanh toán VNPay Sandbox cho tiền cọc của 1 booking đang `pending`. */
  async createPaymentUrl(
    userId: string,
    bookingId: string,
    ipAddr: string,
  ): Promise<{ paymentUrl: string; paymentId: string }> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }
    if (booking.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền thanh toán booking này');
    }
    if (booking.status !== BookingStatus.pending) {
      throw new BadRequestException(
        `Chỉ có thể thanh toán booking đang ở trạng thái "pending" (hiện tại: "${booking.status}")`,
      );
    }

    const amount = Number(booking.depositAmount);
    const txnRef = `${booking.id}-${Date.now()}`;

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        amount,
        method: PaymentMethod.vnpay,
        status: PaymentStatus.pending,
        transactionId: txnRef,
      },
    });

    const tmnCode = this.configService.get<string>('VNPAY_TMN_CODE');
    const hashSecret = this.configService.get<string>('VNPAY_HASH_SECRET');
    const baseUrl = this.configService.get<string>('VNPAY_URL');
    const returnUrl = this.configService.get<string>('VNPAY_RETURN_URL');
    if (!tmnCode || !hashSecret || !baseUrl || !returnUrl) {
      throw new BadRequestException('Chưa cấu hình đầy đủ VNPay Sandbox');
    }

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Thanh toan dat coc booking ${booking.id}`,
      vnp_OrderType: 'other',
      // VNPay yêu cầu số tiền x100 (không có phần thập phân)
      vnp_Amount: String(Math.round(amount * 100)),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: formatVnpayDate(new Date()),
    };
    const { signData, secureHash } = signVnpayParams(params, hashSecret);
    const paymentUrl = `${baseUrl}?${signData}&vnp_SecureHash=${secureHash}`;

    return { paymentUrl, paymentId: payment.id };
  }

  /**
   * Xử lý IPN (server-to-server) VNPay gọi về sau khi khách thanh toán xong.
   * Đây là nguồn xác nhận DUY NHẤT được tin cậy để đổi trạng thái booking
   * (KHÔNG dùng `vnp_ReturnUrl` — đó chỉ là màn hình hiển thị cho khách, có thể
   * bị bỏ qua nếu khách tắt trình duyệt giữa chừng).
   */
  async handleIpn(query: Record<string, string>): Promise<VnpayIpnResult> {
    const hashSecret = this.configService.get<string>('VNPAY_HASH_SECRET');
    if (!hashSecret || !verifyVnpaySignature(query, hashSecret)) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const payment = await this.prisma.payment.findFirst({
      where: { transactionId: query.vnp_TxnRef },
    });
    if (!payment) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    const expectedAmount = Math.round(Number(payment.amount) * 100);
    if (Number(query.vnp_Amount) !== expectedAmount) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }
    if (payment.status !== PaymentStatus.pending) {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    const isSuccess =
      query.vnp_ResponseCode === '00' && query.vnp_TransactionStatus === '00';

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isSuccess ? PaymentStatus.success : PaymentStatus.failed,
        paidAt: isSuccess ? new Date() : null,
      },
    });

    if (isSuccess) {
      await this.confirmBookingAfterPayment(payment.bookingId);
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  /** Verify checksum khi frontend redirect về `vnp_ReturnUrl` — chỉ để hiển thị, không ghi DB. */
  verifyReturnChecksum(query: Record<string, string>): boolean {
    const hashSecret = this.configService.get<string>('VNPAY_HASH_SECRET');
    if (!hashSecret) return false;
    return verifyVnpaySignature(query, hashSecret);
  }

  async getPaymentStatusForBooking(
    bookingId: string,
    currentUser: RequestUser,
  ): Promise<Payment | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }
    const isOwner = booking.userId === currentUser.userId;
    const isStaffOrAdmin =
      currentUser.role === Role.staff || currentUser.role === Role.admin;
    if (!isOwner && !isStaffOrAdmin) {
      throw new ForbiddenException('Bạn không có quyền xem thanh toán này');
    }

    return this.prisma.payment.findFirst({
      where: { bookingId },
      orderBy: { paidAt: 'desc' },
    });
  }

  /**
   * Nhân viên đã chuyển khoản hoàn cọc thủ công (BookingsService.markDepositRefunded)
   * → đánh dấu Payment cọc VNPay thành công gần nhất của đơn là `refunded`.
   * VNPay Sandbox không cấp API hoàn tiền merchant nên tiền hoàn đi bằng
   * chuyển khoản ngoài hệ thống; ở đây chỉ phản ánh đúng trạng thái.
   */
  async markDepositPaymentRefunded(bookingId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { bookingId, status: PaymentStatus.success },
      orderBy: { paidAt: 'desc' },
    });
    if (!payment) {
      this.logger.log(
        `Booking ${bookingId} không có thanh toán cọc VNPay thành công — chỉ cập nhật trạng thái hoàn cọc trên đơn`,
      );
      return;
    }
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.refunded },
    });
  }

  private async confirmBookingAfterPayment(bookingId: string): Promise<void> {
    const job = await this.ttlQueue.getJob(bookingId);
    if (job) {
      await job.remove();
    }
    // updateMany (không phải update) để có điều kiện `status: pending` ngay
    // trong câu lệnh — tránh 1 race hiếm (IPN gọi lại/trùng) vô tình confirm
    // lại 1 booking đã confirmed từ trước. `count === 0` nghĩa là không có
    // gì thật sự đổi (đã confirmed rồi) — không cần thông báo thêm lần nữa.
    const { count } = await this.prisma.booking.updateMany({
      where: { id: bookingId, status: BookingStatus.pending },
      data: { status: BookingStatus.confirmed },
    });
    if (count === 0) return;

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        device: { select: { id: true, name: true, images: true } },
        user: { select: { name: true } },
      },
    });
    if (!booking) return;

    try {
      await this.notificationsService.create(
        booking.userId,
        buildBookingNotification(booking, { kind: 'paid' }, 'customer'),
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo xác nhận cho booking ${bookingId}: ${(error as Error).message}`,
      );
    }

    // Sinh hợp đồng (CCCD masked) — lặp lại logic của
    // `BookingsService.generateAndSaveContract()` vì PaymentsModule KHÔNG
    // import BookingsModule (phụ thuộc 1 chiều Bookings→Payments, xem mục 2
    // CLAUDE.md) — dùng CHUNG đúng 1 hàm thuần `buildContractContent()`, chỉ
    // lặp lại phần truy vấn device/user (không có DI nào mới cần thêm).
    try {
      const [device, user] = await Promise.all([
        this.prisma.device.findUniqueOrThrow({
          where: { id: booking.deviceId },
        }),
        this.prisma.user.findUniqueOrThrow({
          where: { id: booking.userId },
        }),
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
    } catch (error) {
      this.logger.warn(
        `Không sinh được hợp đồng cho booking ${bookingId}: ${(error as Error).message}`,
      );
    }
  }
}
