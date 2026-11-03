import { BadRequestException } from '@nestjs/common';
import {
  BookingStatus,
  DepositRefundStatus,
  DeviceStatus,
} from '../generated/prisma/client';
import { BookingLossService } from './booking-loss.service';

describe('BookingLossService', () => {
  const DAY = 24 * 3600 * 1000;
  const now = new Date('2026-11-20T03:00:00Z');
  const device = {
    id: 'dev-1',
    name: 'Sony A7 IV',
    pricePerDay: '400000',
    originalPrice: '20000000',
  };
  const overdueBooking = {
    id: 'ab12cd34-0000-4000-8000-000000000000',
    userId: 'user-1',
    deviceId: device.id,
    status: BookingStatus.ongoing,
    endTime: new Date(now.getTime() - 8 * DAY),
    depositAmount: '10000000',
    contractSigned: true,
    suspectedLostAt: new Date(now.getTime() - DAY),
  };

  let prisma: any;
  let bookingsService: any;
  let usersService: any;
  let queue: any;
  let service: BookingLossService;

  beforeEach(() => {
    jest.useFakeTimers({ now });
    prisma = {
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      booking: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ ...overdueBooking, ...data })),
      },
      device: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(device),
        update: jest.fn(),
      },
      bookingInspection: {
        findUnique: jest.fn().mockResolvedValue({ images: ['1', '2', '3'] }),
      },
    };
    bookingsService = {
      findByIdOrThrow: jest.fn().mockResolvedValue(overdueBooking),
      notifyStaff: jest.fn(),
      notifyCustomer: jest.fn(),
      afterDeviceStatusChanged: jest.fn(),
    };
    usersService = {
      setBlacklistStatus: jest.fn(),
      findByIdOrThrow: jest.fn().mockResolvedValue({
        cccdMasked: '********1234',
        kycCccdFrontPublicId: 'a',
        kycCccdBackPublicId: 'b',
        kycSelfiePublicId: 'c',
      }),
    };
    queue = { upsertJobScheduler: jest.fn() };
    service = new BookingLossService(
      prisma,
      bookingsService,
      usersService,
      queue,
    );
  });

  afterEach(() => jest.useRealTimers());

  describe('flagSuspectedLost — job lặp đánh dấu quá hạn', () => {
    it('chỉ quét đơn đang thuê, chưa đánh dấu, quá hạn ≥ 7 ngày', async () => {
      await service.flagSuspectedLost(now);
      expect(prisma.booking.findMany).toHaveBeenCalledWith({
        where: {
          status: BookingStatus.ongoing,
          suspectedLostAt: null,
          endTime: { lt: new Date(now.getTime() - 7 * DAY) },
        },
      });
    });

    it('đánh dấu + báo nhân viên và khách (kèm số ngày quá hạn)', async () => {
      prisma.booking.findMany.mockResolvedValue([overdueBooking]);
      await expect(service.flagSuspectedLost(now)).resolves.toBe(1);
      expect(prisma.booking.updateMany).toHaveBeenCalledWith({
        where: { id: overdueBooking.id, suspectedLostAt: null },
        data: { suspectedLostAt: now },
      });
      expect(bookingsService.notifyStaff).toHaveBeenCalledWith(
        overdueBooking.id,
        { kind: 'suspected_lost', overdueDays: 8 },
      );
      expect(bookingsService.notifyCustomer).toHaveBeenCalled();
    });

    it('lần chạy chồng nhau đã đánh dấu rồi → không thông báo lại', async () => {
      prisma.booking.findMany.mockResolvedValue([overdueBooking]);
      prisma.booking.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.flagSuspectedLost(now)).resolves.toBe(0);
      expect(bookingsService.notifyStaff).not.toHaveBeenCalled();
    });
  });

  describe('confirmLost — xác nhận mất thiết bị', () => {
    it('giữ cọc, ghi nợ = giá trị máy − cọc + phí trễ, máy → mất/ngừng cho thuê, tự vào danh sách đen kèm bằng chứng', async () => {
      await service.confirmLost(
        overdueBooking.id,
        'admin-1',
        'Gọi 5 lần không nghe',
      );

      const bookingUpdate = prisma.booking.update.mock.calls[0][0];
      // Trễ 8 ngày, giá thuê 400.000/ngày → phí trễ leo thang
      // 80.000 × (1+…+8) = 2.880.000 → nợ = 20tr − 10tr cọc + 2,88tr = 12,88tr.
      expect(bookingUpdate.data).toEqual(
        expect.objectContaining({
          status: BookingStatus.lost,
          lateFeeAmount: 2_880_000,
          amountOwed: 12_880_000,
          depositRefundAmount: 0,
          depositRefundStatus: DepositRefundStatus.not_refunded,
        }),
      );
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: device.id },
        data: expect.objectContaining({
          status: DeviceStatus.lost,
          isDiscontinued: true,
        }),
      });
      expect(bookingsService.afterDeviceStatusChanged).toHaveBeenCalledWith(
        device.id,
        DeviceStatus.lost,
      );
      const [userId, blacklisted, reason, actorId] =
        usersService.setBlacklistStatus.mock.calls[0];
      expect([userId, blacklisted, actorId]).toEqual([
        overdueBooking.userId,
        true,
        'admin-1',
      ]);
      expect(reason).toContain('#AB12CD34');
      expect(reason).toContain('hợp đồng');
      expect(reason).toContain('eKYC');
      expect(reason).toContain('biên bản giao máy (3 ảnh)');
      expect(reason).toContain('Gọi 5 lần không nghe');
      expect(bookingsService.notifyCustomer).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'lost', amountOwed: 12_880_000 }),
      );
    });

    it('đơn chưa bị đánh dấu nghi mất → chặn, không đổi gì', async () => {
      bookingsService.findByIdOrThrow.mockResolvedValue({
        ...overdueBooking,
        suspectedLostAt: null,
      });
      await expect(
        service.confirmLost(overdueBooking.id, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(usersService.setBlacklistStatus).not.toHaveBeenCalled();
    });

    it('đơn đã trả máy → chặn', async () => {
      bookingsService.findByIdOrThrow.mockResolvedValue({
        ...overdueBooking,
        status: BookingStatus.completed,
      });
      await expect(
        service.confirmLost(overdueBooking.id, 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
