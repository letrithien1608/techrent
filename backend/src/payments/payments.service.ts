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
   * Hoàn cọc tự động khi booking bị huỷ — dùng lại % và số tiền đã tính sẵn ở
   * `BookingsService.cancel()` (mục 4.2 Roadmap). VNPay Sandbox chỉ cấp credential
   * thanh toán (`vnp_TmnCode`/Hash Secret), KHÔNG cấp API hoàn tiền merchant thật
   * (cần `merchant_webapi` riêng, ngoài phạm vi sandbox demo) — nên ở đây chỉ cập
   * nhật đúng trạng thái `Payment.status = refunded` để phản ánh chính sách hoàn
   * cọc, chưa gọi API hoàn tiền thật ra ngoài.
   */
  async refundForBooking(
    bookingId: string,
    refundPercentage: number,
    refundAmount: string,
  ): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { bookingId, status: PaymentStatus.success },
      orderBy: { paidAt: 'desc' },
    });
    if (!payment) {
      this.logger.log(
        `Booking ${bookingId} bị huỷ nhưng chưa có thanh toán thành công nào — không cần hoàn cọc`,
      );
      return;
    }
    if (refundPercentage <= 0) {
      this.logger.log(
        `Booking ${bookingId} huỷ không đủ điều kiện hoàn cọc (0% theo chính sách mục 4.2)`,
      );
      return;
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.refunded },
    });
    this.logger.log(
      `Đã hoàn ${refundPercentage}% cọc (${refundAmount} VND) cho booking ${bookingId}`,
    );
  }

  private async confirmBookingAfterPayment(bookingId: string): Promise<void> {
    const job = await this.ttlQueue.getJob(bookingId);
    if (job) {
      await job.remove();
    }
    await this.prisma.booking.updateMany({
      where: { id: bookingId, status: BookingStatus.pending },
      data: { status: BookingStatus.confirmed },
    });
  }
}
