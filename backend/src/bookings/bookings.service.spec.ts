import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, DeviceStatus, Role } from '../generated/prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { BookingsService } from './bookings.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let tx: {
    $queryRaw: jest.Mock;
    device: { findUnique: jest.Mock };
    booking: { findFirst: jest.Mock; create: jest.Mock };
  };
  let prisma: {
    $transaction: jest.Mock;
    booking: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    device: { update: jest.Mock };
  };
  let configService: { get: jest.Mock };
  let ttlQueue: { add: jest.Mock; getJob: jest.Mock };

  const deviceId = 'device-1';
  const customer: RequestUser = {
    userId: 'user-1',
    email: 'a@example.com',
    role: Role.customer,
  };
  const otherCustomer: RequestUser = {
    userId: 'user-2',
    email: 'b@example.com',
    role: Role.customer,
  };
  const admin: RequestUser = {
    userId: 'admin-1',
    email: 'admin@example.com',
    role: Role.admin,
  };

  const baseDevice = {
    id: deviceId,
    status: DeviceStatus.available,
    pricePerHour: '10000',
    pricePerDay: '80000',
  };

  const baseBooking = {
    id: 'booking-1',
    userId: customer.userId,
    deviceId,
    startTime: new Date(Date.now() + 48 * 3600 * 1000),
    endTime: new Date(Date.now() + 50 * 3600 * 1000),
    status: BookingStatus.pending,
    totalPrice: '30000',
    depositAmount: '9000',
    createdAt: new Date(),
  };

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      device: { findUnique: jest.fn() },
      booking: { findFirst: jest.fn(), create: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: unknown) => Promise<unknown>)(tx);
        }
        return Promise.all(arg as Promise<unknown>[]);
      }),
      booking: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      device: { update: jest.fn() },
    };
    configService = { get: jest.fn().mockReturnValue('5') };
    ttlQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
    };

    service = new BookingsService(
      prisma as unknown as PrismaService,
      configService as any,
      ttlQueue as any,
    );
  });

  describe('create', () => {
    const validDto = {
      deviceId,
      startTime: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      endTime: new Date(Date.now() + 50 * 3600 * 1000).toISOString(),
    };

    it('ném BadRequestException nếu endTime <= startTime', async () => {
      await expect(
        service.create(customer.userId, {
          ...validDto,
          endTime: validDto.startTime,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ném BadRequestException nếu startTime ở quá khứ', async () => {
      await expect(
        service.create(customer.userId, {
          ...validDto,
          startTime: new Date(Date.now() - 3600 * 1000).toISOString(),
          endTime: new Date(Date.now() + 3600 * 1000).toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ném NotFoundException nếu không tìm thấy thiết bị', async () => {
      tx.device.findUnique.mockResolvedValue(null);

      await expect(
        service.create(customer.userId, validDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([DeviceStatus.broken, DeviceStatus.maintenance])(
      'ném BadRequestException nếu thiết bị đang %s',
      async (status) => {
        tx.device.findUnique.mockResolvedValue({ ...baseDevice, status });

        await expect(
          service.create(customer.userId, validDto),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );

    it('ném ConflictException nếu trùng lịch với booking đang active', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(baseBooking);

      await expect(
        service.create(customer.userId, validDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

    it('tính totalPrice theo GIỜ nếu thời lượng <= 24h', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(null);
      tx.booking.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'b1', ...args.data }),
      );

      const start = new Date(Date.now() + 24 * 3600 * 1000);
      const end = new Date(start.getTime() + 5 * 3600 * 1000); // 5 giờ

      await service.create(customer.userId, {
        deviceId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      const createArg = tx.booking.create.mock.calls[0][0];
      expect(createArg.data.totalPrice).toBe(10000 * 5); // pricePerHour * 5
      expect(createArg.data.depositAmount).toBeCloseTo(10000 * 5 * 0.3);
    });

    it('tính totalPrice theo NGÀY nếu thời lượng > 24h', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(null);
      tx.booking.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'b1', ...args.data }),
      );

      const start = new Date(Date.now() + 24 * 3600 * 1000);
      const end = new Date(start.getTime() + 50 * 3600 * 1000); // ~2.08 ngày -> ceil = 3 ngày

      await service.create(customer.userId, {
        deviceId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      const createArg = tx.booking.create.mock.calls[0][0];
      expect(createArg.data.totalPrice).toBe(80000 * 3); // pricePerDay * ceil(50/24)
    });

    it('lên lịch job TTL với jobId = booking.id và delay đúng BOOKING_TTL_MINUTES', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(null);
      tx.booking.create.mockResolvedValue(baseBooking);
      configService.get.mockReturnValue('5');

      await service.create(customer.userId, validDto);

      expect(ttlQueue.add).toHaveBeenCalledWith(
        expect.any(String),
        { bookingId: baseBooking.id },
        { jobId: baseBooking.id, delay: 5 * 60 * 1000 },
      );
    });

    it('vẫn trả về booking thành công dù lên lịch job TTL thất bại (chỉ log warning)', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(null);
      tx.booking.create.mockResolvedValue(baseBooking);
      ttlQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(service.create(customer.userId, validDto)).resolves.toEqual(
        baseBooking,
      );
    });
  });

  describe('checkAvailability', () => {
    it('trả về true nếu không có booking trùng', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);

      const result = await service.checkAvailability(
        deviceId,
        baseBooking.startTime,
        baseBooking.endTime,
      );
      expect(result).toBe(true);
    });

    it('trả về false nếu có booking trùng', async () => {
      prisma.booking.findFirst.mockResolvedValue(baseBooking);

      const result = await service.checkAvailability(
        deviceId,
        baseBooking.startTime,
        baseBooking.endTime,
      );
      expect(result).toBe(false);
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.booking.findMany.mockResolvedValue([baseBooking]);
      prisma.booking.count.mockResolvedValue(1);
    });

    it('customer chỉ thấy booking của chính mình', async () => {
      await service.findAll(customer, { page: 1, limit: 20 });

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: customer.userId } }),
      );
    });

    it('admin thấy TẤT CẢ booking (không lọc theo userId)', async () => {
      await service.findAll(admin, { page: 1, limit: 20 });

      expect(prisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findOneForUser', () => {
    it('ném ForbiddenException nếu customer xem booking của người khác', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      await expect(
        service.findOneForUser(baseBooking.id, otherCustomer),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cho phép staff/admin xem booking của bất kỳ ai', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      await expect(
        service.findOneForUser(baseBooking.id, admin),
      ).resolves.toEqual(baseBooking);
    });
  });

  describe('state machine (confirm/start/complete)', () => {
    it('confirm() chuyển pending -> confirmed và huỷ job TTL', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.pending,
      });
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });
      const removeMock = jest.fn();
      ttlQueue.getJob.mockResolvedValue({ remove: removeMock });

      const result = await service.confirm(baseBooking.id);

      expect(result.status).toBe(BookingStatus.confirmed);
      expect(removeMock).toHaveBeenCalled();
    });

    it('confirm() ném BadRequestException nếu booking không ở trạng thái pending', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });

      await expect(service.confirm(baseBooking.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('start() chuyển confirmed -> ongoing và set device status = rented', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.ongoing,
      });
      prisma.device.update.mockResolvedValue({
        ...baseDevice,
        status: DeviceStatus.rented,
      });

      await service.start(baseBooking.id);

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: baseBooking.deviceId },
        data: { status: DeviceStatus.rented },
      });
    });

    it('start() ném BadRequestException nếu booking không ở trạng thái confirmed', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.pending,
      });

      await expect(service.start(baseBooking.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('complete() chuyển ongoing -> completed và set device status = available', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.ongoing,
      });
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.completed,
      });
      prisma.device.update.mockResolvedValue({
        ...baseDevice,
        status: DeviceStatus.available,
      });

      await service.complete(baseBooking.id);

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: baseBooking.deviceId },
        data: { status: DeviceStatus.available },
      });
    });
  });

  describe('cancel — chính sách hoàn cọc mục 4.2 Roadmap', () => {
    it('ném ForbiddenException nếu customer huỷ booking của người khác', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      await expect(
        service.cancel(baseBooking.id, otherCustomer, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ném BadRequestException nếu booking đã completed/cancelled', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.completed,
      });

      await expect(
        service.cancel(baseBooking.id, customer, {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hoàn 100% nếu huỷ trước giờ thuê >= 24 tiếng', async () => {
      const booking = {
        ...baseBooking,
        startTime: new Date(Date.now() + 25 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.cancelled,
      });

      const result = await service.cancel(booking.id, customer, {});

      expect(result.refundPercentage).toBe(100);
    });

    it('hoàn 50% nếu huỷ trước giờ thuê 6-24 tiếng', async () => {
      const booking = {
        ...baseBooking,
        startTime: new Date(Date.now() + 10 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.cancelled,
      });

      const result = await service.cancel(booking.id, customer, {});

      expect(result.refundPercentage).toBe(50);
    });

    it('KHÔNG hoàn (0%) nếu huỷ trước giờ thuê < 6 tiếng', async () => {
      const booking = {
        ...baseBooking,
        startTime: new Date(Date.now() + 3 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.cancelled,
      });

      const result = await service.cancel(booking.id, customer, {});

      expect(result.refundPercentage).toBe(0);
    });

    it('bỏ qua cờ storeFault nếu người gọi là customer (không được tự cho mình hoàn 100%)', async () => {
      const booking = {
        ...baseBooking,
        startTime: new Date(Date.now() + 3 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.cancelled,
      });

      const result = await service.cancel(booking.id, customer, {
        storeFault: true,
      });

      expect(result.refundPercentage).toBe(0);
    });

    it('hoàn 100% bất kể thời điểm nếu staff/admin đánh dấu storeFault (lỗi từ cửa hàng)', async () => {
      const booking = {
        ...baseBooking,
        startTime: new Date(Date.now() + 3 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.cancelled,
      });

      const result = await service.cancel(booking.id, admin, {
        storeFault: true,
      });

      expect(result.refundPercentage).toBe(100);
    });

    it('tính đúng refundAmount = depositAmount * refundPercentage', async () => {
      const booking = {
        ...baseBooking,
        depositAmount: '9000',
        startTime: new Date(Date.now() + 10 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.cancelled,
      });

      const result = await service.cancel(booking.id, customer, {});

      expect(result.refundAmount).toBe('4500.00');
    });
  });

  describe('expireIfStillPending (BullMQ TTL processor)', () => {
    it('chuyển booking sang cancelled nếu vẫn còn pending', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.pending,
      });

      await service.expireIfStillPending(baseBooking.id);

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: baseBooking.id },
        data: { status: BookingStatus.cancelled },
      });
    });

    it('KHÔNG đụng vào booking đã confirmed (job TTL lẽ ra đã bị huỷ nhưng phòng hờ)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });

      await service.expireIfStillPending(baseBooking.id);

      expect(prisma.booking.update).not.toHaveBeenCalled();
    });
  });
});
