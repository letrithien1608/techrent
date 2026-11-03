import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
} from '../generated/prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { PaymentsService } from './payments.service';
import { signVnpayParams } from './vnpay.util';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: {
    booking: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    payment: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    device: { findUniqueOrThrow: jest.Mock };
    user: { findUniqueOrThrow: jest.Mock };
  };
  let configService: { get: jest.Mock };
  let ttlQueue: { getJob: jest.Mock };
  let notificationsService: { create: jest.Mock };

  const hashSecret = 'test-hash-secret';
  const envValues: Record<string, string> = {
    VNPAY_TMN_CODE: 'PH6FRERN',
    VNPAY_HASH_SECRET: hashSecret,
    VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    VNPAY_RETURN_URL: 'http://localhost:3000/payment/vnpay-return',
  };

  const bookingId = 'booking-1';
  const userId = 'user-1';
  const baseBooking = {
    id: bookingId,
    userId,
    status: BookingStatus.pending,
    totalPrice: '30000',
    depositAmount: '90000',
    createdAt: new Date(),
    startTime: new Date(Date.now() + 48 * 3600 * 1000),
    endTime: new Date(Date.now() + 50 * 3600 * 1000),
    device: { id: 'device-1', name: 'MacBook Pro 14"', images: [] },
    user: { name: 'Khách A' },
  };
  const baseDevice = {
    id: 'device-1',
    name: 'MacBook Pro 14"',
    pricePerDay: '80000',
    originalPrice: '20000000',
    detailedDescription: 'Máy đẹp 95%',
  };
  const baseUser = {
    id: userId,
    name: 'Nguyễn Văn A',
    phone: '0900000000',
    cccdMasked: '********0000',
  };
  const admin: RequestUser = {
    userId: 'admin-1',
    email: 'a@a.com',
    role: Role.admin,
  };

  beforeEach(() => {
    prisma = {
      booking: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      payment: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      device: { findUniqueOrThrow: jest.fn().mockResolvedValue(baseDevice) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(baseUser) },
    };
    configService = { get: jest.fn((key: string) => envValues[key]) };
    ttlQueue = { getJob: jest.fn().mockResolvedValue(null) };
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    service = new PaymentsService(
      prisma as unknown as PrismaService,
      configService as any,
      ttlQueue as any,
      notificationsService as any,
    );
  });

  describe('createPaymentUrl', () => {
    it('ném NotFoundException nếu không tìm thấy booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.createPaymentUrl(userId, bookingId, '127.0.0.1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ném ForbiddenException nếu không phải chủ booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      await expect(
        service.createPaymentUrl('other-user', bookingId, '127.0.0.1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ném BadRequestException nếu booking không ở trạng thái pending', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });
      await expect(
        service.createPaymentUrl(userId, bookingId, '127.0.0.1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tạo payment pending + trả về URL VNPay có đủ tham số ký', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.payment.create.mockResolvedValue({ id: 'payment-1' });

      const result = await service.createPaymentUrl(
        userId,
        bookingId,
        '1.2.3.4',
      );

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingId,
            method: PaymentMethod.vnpay,
            status: PaymentStatus.pending,
          }),
        }),
      );
      expect(result.paymentUrl).toContain(envValues.VNPAY_URL);
      expect(result.paymentUrl).toContain('vnp_TmnCode=PH6FRERN');
      expect(result.paymentUrl).toContain('vnp_SecureHash=');
      // Số tiền gửi VNPay phải x100 so với tiền cọc gốc
      expect(result.paymentUrl).toContain('vnp_Amount=9000000');
    });
  });

  describe('handleIpn', () => {
    const buildQuery = (overrides: Record<string, string> = {}) => {
      const params = {
        vnp_TmnCode: 'PH6FRERN',
        vnp_TxnRef: 'booking-1-123',
        vnp_Amount: '9000000',
        vnp_ResponseCode: '00',
        vnp_TransactionStatus: '00',
        ...overrides,
      };
      const { secureHash } = signVnpayParams(params, hashSecret);
      return { ...params, vnp_SecureHash: secureHash };
    };

    it('trả RspCode 97 nếu chữ ký không hợp lệ', async () => {
      const query = buildQuery();
      query.vnp_SecureHash = 'sai-chu-ky';
      const result = await service.handleIpn(query);
      expect(result.RspCode).toBe('97');
    });

    it('trả RspCode 01 nếu không tìm thấy giao dịch', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      const result = await service.handleIpn(buildQuery());
      expect(result.RspCode).toBe('01');
    });

    it('trả RspCode 04 nếu số tiền không khớp', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        bookingId,
        amount: '50000',
        status: PaymentStatus.pending,
      });
      const result = await service.handleIpn(buildQuery());
      expect(result.RspCode).toBe('04');
    });

    it('trả RspCode 02 nếu giao dịch đã được xử lý trước đó', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        bookingId,
        amount: '90000',
        status: PaymentStatus.success,
      });
      const result = await service.handleIpn(buildQuery());
      expect(result.RspCode).toBe('02');
    });

    it('thanh toán thành công: cập nhật payment success + booking confirmed + huỷ job TTL + tạo thông báo', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        bookingId,
        amount: '90000',
        status: PaymentStatus.pending,
      });
      const removeMock = jest.fn();
      ttlQueue.getJob.mockResolvedValue({ remove: removeMock });
      prisma.booking.updateMany.mockResolvedValue({ count: 1 });
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      const result = await service.handleIpn(buildQuery());

      expect(result.RspCode).toBe('00');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.success }),
        }),
      );
      expect(removeMock).toHaveBeenCalled();
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: bookingId, status: BookingStatus.pending },
        data: { status: BookingStatus.confirmed },
      });
      expect(notificationsService.create).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          type: 'booking_paid',
          message: expect.stringContaining('Đã nhận cọc'),
        }),
      );
    });

    it('thanh toán thành công: sinh hợp đồng với CCCD MASKED', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        bookingId,
        amount: '90000',
        status: PaymentStatus.pending,
      });
      ttlQueue.getJob.mockResolvedValue(null);
      prisma.booking.updateMany.mockResolvedValue({ count: 1 });
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      await service.handleIpn(buildQuery());

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: bookingId },
        data: { contractContent: expect.stringContaining('********0000') },
      });
    });

    it('KHÔNG tạo thông báo trùng nếu updateMany không đổi gì (đã confirmed từ trước, race hiếm)', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        bookingId,
        amount: '90000',
        status: PaymentStatus.pending,
      });
      ttlQueue.getJob.mockResolvedValue(null);
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });

      await service.handleIpn(buildQuery());

      expect(notificationsService.create).not.toHaveBeenCalled();
    });

    it('thanh toán thất bại: chỉ set payment failed, KHÔNG đổi trạng thái booking', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: 'payment-1',
        bookingId,
        amount: '90000',
        status: PaymentStatus.pending,
      });

      const result = await service.handleIpn(
        buildQuery({ vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }),
      );

      expect(result.RspCode).toBe('00');
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PaymentStatus.failed }),
        }),
      );
      expect(prisma.booking.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('markDepositPaymentRefunded', () => {
    it('bỏ qua nếu đơn không có thanh toán cọc VNPay thành công', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);
      await service.markDepositPaymentRefunded(bookingId);
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('đánh dấu payment cọc thành công gần nhất là refunded', async () => {
      prisma.payment.findFirst.mockResolvedValue({ id: 'payment-1' });
      await service.markDepositPaymentRefunded(bookingId);
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { bookingId, status: PaymentStatus.success },
        }),
      );
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'payment-1' },
        data: { status: PaymentStatus.refunded },
      });
    });
  });

  describe('getPaymentStatusForBooking', () => {
    it('ném ForbiddenException nếu không phải chủ booking và không phải staff/admin', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      const otherUser: RequestUser = {
        userId: 'user-2',
        email: 'x@x.com',
        role: Role.customer,
      };
      await expect(
        service.getPaymentStatusForBooking(bookingId, otherUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cho phép staff/admin xem thanh toán của bất kỳ booking nào', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.payment.findFirst.mockResolvedValue({ id: 'payment-1' });
      await expect(
        service.getPaymentStatusForBooking(bookingId, admin),
      ).resolves.toEqual({ id: 'payment-1' });
    });
  });
});
