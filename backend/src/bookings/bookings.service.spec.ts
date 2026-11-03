import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BookingStatus,
  DepositRefundStatus,
  DeviceCondition,
  DeviceStatus,
  RentalPaymentMethod,
  Role,
} from '../generated/prisma/client';
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
      findUniqueOrThrow: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
    device: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
    bookingInspection: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      create: jest.Mock;
    };
    maintenance: { create: jest.Mock };
  };
  let configService: { get: jest.Mock };
  let ttlQueue: { add: jest.Mock; getJob: jest.Mock };
  let paymentsService: { markDepositPaymentRefunded: jest.Mock };
  let uploadService: { uploadInspectionImages: jest.Mock };
  let usersService: { findByIdOrThrow: jest.Mock; revealCccd: jest.Mock };
  let realtimeGateway: { emitDeviceStatusChanged: jest.Mock };
  let notificationsService: { create: jest.Mock; createForRoles: jest.Mock };
  let devicesCacheService: { invalidateAll: jest.Mock };

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
    name: 'MacBook Pro 14"',
    status: DeviceStatus.available,
    pricePerHour: '10000',
    pricePerDay: '80000',
    originalPrice: '20000000',
    detailedDescription: 'Máy đẹp 95%',
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
    contractSigned: false,
    contractSignedAt: null,
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
        // Dữ liệu dựng nội dung thông báo (BookingsService.notificationContent()).
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'booking-1',
          startTime: new Date('2026-10-25T02:00:00Z'),
          endTime: new Date('2026-10-27T11:00:00Z'),
          totalPrice: 100000,
          depositAmount: 10000000,
          device: { id: 'device-1', name: 'MacBook Pro', images: [] },
          user: { name: 'Khách A' },
        }),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      device: { update: jest.fn(), findUniqueOrThrow: jest.fn() },
      bookingInspection: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        create: jest.fn(),
      },
      maintenance: { create: jest.fn() },
    };
    prisma.device.findUniqueOrThrow.mockResolvedValue(baseDevice);
    configService = { get: jest.fn().mockReturnValue('5') };
    ttlQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
    };
    paymentsService = {
      markDepositPaymentRefunded: jest.fn().mockResolvedValue(undefined),
    };
    uploadService = {
      uploadInspectionImages: jest
        .fn()
        .mockImplementation((files: unknown[]) =>
          Promise.resolve(files.map((_, i) => `https://img/${i}.jpg`)),
        ),
    };
    // Mặc định user ĐÃ có CCCD + ĐỦ 3 ảnh KYC để các test `create` có sẵn từ
    // trước không bị ảnh hưởng — test riêng cho từng lớp chặn tự override lại.
    usersService = {
      findByIdOrThrow: jest.fn().mockResolvedValue({
        id: customer.userId,
        name: 'Nguyễn Văn A',
        phone: '0900000000',
        cccdHash: 'a'.repeat(64),
        cccdMasked: '********0000',
        kycCccdFrontPublicId: 'kyc/u1-cccd-front',
        kycCccdBackPublicId: 'kyc/u1-cccd-back',
        kycSelfiePublicId: 'kyc/u1-selfie',
      }),
      revealCccd: jest.fn().mockResolvedValue('001234000000'),
    };
    realtimeGateway = { emitDeviceStatusChanged: jest.fn() };
    notificationsService = {
      create: jest.fn().mockResolvedValue(undefined),
      createForRoles: jest.fn().mockResolvedValue(undefined),
    };
    devicesCacheService = {
      invalidateAll: jest.fn().mockResolvedValue(undefined),
    };

    service = new BookingsService(
      prisma as unknown as PrismaService,
      configService as any,
      ttlQueue as any,
      paymentsService as any,
      usersService as any,
      realtimeGateway as any,
      notificationsService as any,
      devicesCacheService as any,
      uploadService as any,
    );
  });

  describe('create', () => {
    const validDto = {
      deviceId,
      startTime: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      endTime: new Date(Date.now() + 50 * 3600 * 1000).toISOString(),
    };

    // Lớp chặn NGHIÊM TRỌNG NHẤT (mở rộng 22/10 buổi 6, mục 7 Roadmap) — kiểm
    // tra blacklist TRƯỚC CẢ CCCD/KYC, vì đây là chặn hành chính, không liên
    // quan tới hồ sơ xác thực danh tính.
    it('ném ForbiddenException nếu user đã bị đưa vào danh sách đen (isBlacklisted)', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        id: customer.userId,
        isBlacklisted: true,
        cccdHash: 'a'.repeat(64),
        kycCccdFrontPublicId: 'kyc/u1-cccd-front',
        kycCccdBackPublicId: 'kyc/u1-cccd-back',
        kycSelfiePublicId: 'kyc/u1-selfie',
      });

      await expect(
        service.create(customer.userId, validDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Phải chặn NGAY, không tốn công kiểm tra CCCD/KYC hay chạm transaction.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // Lớp chặn quan trọng nhất của KYC (mục 7 Roadmap) — kiểm tra CCCD TRƯỚC
    // cả validate thời gian, nên đặt lên đầu describe cho dễ đối chiếu.
    it('ném BadRequestException nếu user CHƯA có CCCD trong hồ sơ (cccdHash null)', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        id: customer.userId,
        cccdHash: null,
      });

      await expect(
        service.create(customer.userId, validDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      // Phải chặn NGAY, không được chạm tới transaction/DB thiết bị.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // Mở rộng KYC (22/10) — số CCCD thôi không còn đủ, phải đủ cả 3 ảnh eKYC.
    it('ném BadRequestException nếu user CÓ cccdHash nhưng CHƯA đủ 3 ảnh KYC', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        id: customer.userId,
        cccdHash: 'a'.repeat(64),
        kycCccdFrontPublicId: 'kyc/u1-cccd-front',
        kycCccdBackPublicId: null, // thiếu mặt sau
        kycSelfiePublicId: null, // thiếu ảnh chân dung
      });

      await expect(
        service.create(customer.userId, validDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('cho phép tạo booking bình thường nếu user ĐÃ có CCCD (cccdHash khác null)', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(null);
      tx.booking.create.mockImplementation((args: any) =>
        Promise.resolve({ id: 'b1', ...args.data }),
      );

      await expect(service.create(customer.userId, validDto)).resolves.toEqual(
        expect.objectContaining({ id: 'b1' }),
      );
      expect(usersService.findByIdOrThrow).toHaveBeenCalledWith(
        customer.userId,
      );
    });

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

    it('chặn đặt thiết bị đã ngừng kinh doanh, không tạo đơn', async () => {
      tx.device.findUnique.mockResolvedValue({
        ...baseDevice,
        isDiscontinued: true,
      });

      await expect(service.create(customer.userId, validDto)).rejects.toThrow(
        'ngừng cho thuê',
      );
      expect(tx.booking.create).not.toHaveBeenCalled();
    });

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
      // Cọc = 50% originalPrice, KHÔNG phụ thuộc totalPrice/thời lượng thuê.
      expect(createArg.data.depositAmount).toBeCloseTo(20000000 * 0.5);
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

    it('KHÔNG emit realtime khi tạo booking (Device.status không đổi ở bước này)', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(null);
      tx.booking.create.mockResolvedValue(baseBooking);

      await service.create(customer.userId, validDto);

      expect(realtimeGateway.emitDeviceStatusChanged).not.toHaveBeenCalled();
    });

    it('tạo thông báo "có đơn mới" cho staff/admin (KHÔNG loại trừ ai)', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(null);
      tx.booking.create.mockResolvedValue(baseBooking);

      await service.create(customer.userId, validDto);

      expect(notificationsService.createForRoles).toHaveBeenCalledWith(
        [Role.staff, Role.admin],
        expect.objectContaining({ type: 'booking_pending' }),
      );
    });

    it('vẫn trả về booking thành công dù tạo thông báo cho staff/admin thất bại (chỉ log warning)', async () => {
      tx.device.findUnique.mockResolvedValue(baseDevice);
      tx.booking.findFirst.mockResolvedValue(null);
      tx.booking.create.mockResolvedValue(baseBooking);
      notificationsService.createForRoles.mockRejectedValue(
        new Error('DB down'),
      );

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

    it('kèm thông tin thiết bị (device) trong kết quả truy vấn', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      await service.findOneForUser(baseBooking.id, admin);

      expect(prisma.booking.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: baseBooking.id },
          include: expect.objectContaining({ device: expect.anything() }),
        }),
      );
    });
  });

  describe('state machine (confirm/start/confirmReturn)', () => {
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
      expect(notificationsService.create).toHaveBeenCalledWith(
        baseBooking.userId,
        expect.objectContaining({ type: 'booking_confirmed' }),
      );
    });

    it('confirm() sinh và lưu hợp đồng với CCCD dạng MASKED', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.pending,
      });
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });
      ttlQueue.getJob.mockResolvedValue(null);

      await service.confirm(baseBooking.id);

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: baseBooking.id },
        data: { contractContent: expect.stringContaining('********0000') },
      });
      const contractCall = prisma.booking.update.mock.calls.find(
        (call) => 'contractContent' in call[0].data,
      );
      expect(contractCall![0].data.contractContent).not.toContain(
        '001234000000',
      );
    });

    it('confirm() không hỏng việc xác nhận dù sinh hợp đồng thất bại', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.pending,
      });
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });
      ttlQueue.getJob.mockResolvedValue(null);
      prisma.device.findUniqueOrThrow.mockRejectedValue(new Error('DB down'));

      const result = await service.confirm(baseBooking.id);

      expect(result.status).toBe(BookingStatus.confirmed);
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

    it('start() chuyển confirmed -> ongoing và set device status = rented khi đủ điều kiện', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
        rentalPaid: true,
        contractSigned: true,
      });
      prisma.bookingInspection.findUnique.mockResolvedValue({ id: 'insp-1' });
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
      expect(realtimeGateway.emitDeviceStatusChanged).toHaveBeenCalledWith({
        deviceId: baseBooking.deviceId,
        status: DeviceStatus.rented,
      });
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        baseBooking.userId,
        expect.objectContaining({ type: 'booking_ongoing' }),
      );
    });

    it('start() chặn giao máy khi chưa thu tiền thuê, chưa ký hợp đồng, chưa có biên bản — liệt kê đủ lý do', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
        rentalPaid: false,
        contractSigned: false,
      });
      prisma.bookingInspection.findUnique.mockResolvedValue(null);

      await expect(service.start(baseBooking.id)).rejects.toThrow(
        'Chưa thể giao máy: chưa thu tiền thuê, khách chưa ký hợp đồng, chưa lập biên bản giao máy',
      );
      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(prisma.device.update).not.toHaveBeenCalled();
    });

    it.each([
      ['chưa thu tiền thuê', { rentalPaid: false, contractSigned: true }, true],
      [
        'khách chưa ký hợp đồng',
        { rentalPaid: true, contractSigned: false },
        true,
      ],
      [
        'chưa lập biên bản giao máy',
        { rentalPaid: true, contractSigned: true },
        false,
      ],
    ])(
      'start() chặn khi thiếu đúng 1 điều kiện: %s',
      async (reason, flags, hasHandover) => {
        prisma.booking.findUnique.mockResolvedValue({
          ...baseBooking,
          status: BookingStatus.confirmed,
          ...flags,
        });
        prisma.bookingInspection.findUnique.mockResolvedValue(
          hasHandover ? { id: 'insp-1' } : null,
        );

        await expect(service.start(baseBooking.id)).rejects.toThrow(
          `Chưa thể giao máy: ${reason}`,
        );
      },
    );

    it('start() ném BadRequestException nếu booking không ở trạng thái confirmed', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.pending,
      });

      await expect(service.start(baseBooking.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('biên bản giao máy + thu tiền thuê', () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' };

    it('recordHandover() chặn khi ít hơn 3 ảnh, không upload gì', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });

      await expect(
        service.recordHandover(baseBooking.id, admin.userId, [file, file]),
      ).rejects.toThrow('tối thiểu 3 ảnh');
      expect(uploadService.uploadInspectionImages).not.toHaveBeenCalled();
    });

    it('recordHandover() chỉ lập cho đơn đã xác nhận (không cho đơn đang thuê)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.ongoing,
      });

      await expect(
        service.recordHandover(baseBooking.id, admin.userId, [
          file,
          file,
          file,
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recordHandover() upload ảnh rồi lưu biên bản (lập lại thì ghi đè)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });

      await service.recordHandover(
        baseBooking.id,
        admin.userId,
        [file, file, file],
        '  Trầy nhẹ góc trái, kèm sạc  ',
      );

      expect(uploadService.uploadInspectionImages).toHaveBeenCalledWith(
        [file, file, file],
        baseBooking.id,
        'handover',
      );
      expect(prisma.bookingInspection.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            bookingId_type: { bookingId: baseBooking.id, type: 'handover' },
          },
          create: expect.objectContaining({
            images: [
              'https://img/0.jpg',
              'https://img/1.jpg',
              'https://img/2.jpg',
            ],
            notes: 'Trầy nhẹ góc trái, kèm sạc',
            performedById: admin.userId,
          }),
        }),
      );
    });

    it('recordRentalPayment() lưu hình thức + người thu và báo khách', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
        rentalPaid: false,
      });

      await service.recordRentalPayment(
        baseBooking.id,
        admin.userId,
        RentalPaymentMethod.cash,
      );

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: baseBooking.id },
        data: expect.objectContaining({
          rentalPaid: true,
          rentalPaymentMethod: RentalPaymentMethod.cash,
          rentalCollectedById: admin.userId,
        }),
      });
      expect(notificationsService.create).toHaveBeenCalledWith(
        baseBooking.userId,
        expect.objectContaining({ type: 'booking_rental_paid' }),
      );
    });

    it('recordRentalPayment() không thu 2 lần', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
        rentalPaid: true,
      });

      await expect(
        service.recordRentalPayment(
          baseBooking.id,
          admin.userId,
          RentalPaymentMethod.cash,
        ),
      ).rejects.toThrow('đã thu tiền thuê');
    });
  });

  describe('confirmReturn — nhận lại máy + quyết toán cọc', () => {
    const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' };
    // baseDevice: pricePerDay 80.000, originalPrice 20.000.000
    const ongoing = {
      ...baseBooking,
      status: BookingStatus.ongoing,
      depositAmount: '10000000',
      endTime: new Date(Date.now() + 3600 * 1000),
    };

    function lastBookingUpdate() {
      return prisma.booking.update.mock.calls.at(-1)?.[0] as {
        data: Record<string, unknown>;
      };
    }

    it('nguyên vẹn, đúng hạn: hoàn đủ cọc, chờ hoàn, thiết bị về available', async () => {
      prisma.booking.findUnique.mockResolvedValue(ongoing);

      await service.confirmReturn(
        ongoing.id,
        admin.userId,
        { condition: DeviceCondition.intact },
        [],
      );

      expect(lastBookingUpdate().data).toEqual(
        expect.objectContaining({
          status: BookingStatus.completed,
          lateFeeAmount: 0,
          damageFeeAmount: 0,
          depositRefundAmount: 10_000_000,
          amountOwed: 0,
          depositRefundStatus: DepositRefundStatus.pending,
          depositRefundDueAt: expect.any(Date),
        }),
      );
      // totalPrice KHÔNG còn bị cộng phí trễ hạn (phí trừ vào cọc).
      expect(lastBookingUpdate().data).not.toHaveProperty('totalPrice');
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { status: DeviceStatus.available },
      });
      expect(realtimeGateway.emitDeviceStatusChanged).toHaveBeenCalledWith({
        deviceId,
        status: DeviceStatus.available,
      });
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
      expect(prisma.maintenance.create).not.toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        ongoing.userId,
        expect.objectContaining({ type: 'booking_returned' }),
      );
    });

    it('trễ 2 ngày: phí trễ hạn leo thang (16.000 + 32.000) trừ vào cọc', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...ongoing,
        endTime: new Date(Date.now() - 30 * 3600 * 1000),
      });

      await service.confirmReturn(
        ongoing.id,
        admin.userId,
        { condition: DeviceCondition.intact },
        [],
      );

      expect(lastBookingUpdate().data).toEqual(
        expect.objectContaining({
          lateFeeAmount: 48_000,
          depositRefundAmount: 10_000_000 - 48_000,
        }),
      );
    });

    it('hư hỏng: trừ phí bồi thường, lưu biên bản + ảnh, máy chuyển bảo trì kèm phiếu', async () => {
      prisma.booking.findUnique.mockResolvedValue(ongoing);

      await service.confirmReturn(
        ongoing.id,
        admin.userId,
        {
          condition: DeviceCondition.damaged,
          damageDescription: 'Nứt màn hình góc phải',
          damageFee: 3_000_000,
        },
        [file],
      );

      expect(lastBookingUpdate().data).toEqual(
        expect.objectContaining({
          damageFeeAmount: 3_000_000,
          depositRefundAmount: 7_000_000,
        }),
      );
      expect(prisma.bookingInspection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'return',
          condition: DeviceCondition.damaged,
          damageDescription: 'Nứt màn hình góc phải',
          images: ['https://img/0.jpg'],
        }),
      });
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { status: DeviceStatus.maintenance },
      });
      expect(prisma.maintenance.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deviceId,
          issue: 'Trả máy – Hư hỏng: Nứt màn hình góc phải',
        }),
      });
      expect(realtimeGateway.emitDeviceStatusChanged).toHaveBeenCalledWith({
        deviceId,
        status: DeviceStatus.maintenance,
      });
    });

    it('trễ hạn + hư hỏng vượt tiền cọc: hoàn 0, không hoàn cọc, lưu tiền khách còn nợ', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...ongoing,
        depositAmount: '1000000',
        endTime: new Date(Date.now() - 12 * 3600 * 1000),
      });

      await service.confirmReturn(
        ongoing.id,
        admin.userId,
        {
          condition: DeviceCondition.missing_accessories,
          damageDescription: 'Mất sạc',
          damageFee: 1_200_000,
        },
        [file],
      );

      // 1.000.000 − 16.000 − 1.200.000 = −216.000
      expect(lastBookingUpdate().data).toEqual(
        expect.objectContaining({
          lateFeeAmount: 16_000,
          damageFeeAmount: 1_200_000,
          depositRefundAmount: 0,
          amountOwed: 216_000,
          depositRefundStatus: DepositRefundStatus.not_refunded,
          depositRefundDueAt: null,
        }),
      );
    });

    it('trừ thêm chi phí sửa đã ghi khi báo lỗi (lỗi do khách) vào cọc', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...ongoing,
        repairFeeAmount: '1500000',
      });

      await service.confirmReturn(
        ongoing.id,
        admin.userId,
        { condition: DeviceCondition.intact },
        [],
      );

      expect(lastBookingUpdate().data).toEqual(
        expect.objectContaining({ depositRefundAmount: 8_500_000 }),
      );
    });

    it('nguyên vẹn thì bỏ qua số tiền bồi thường gửi kèm', async () => {
      prisma.booking.findUnique.mockResolvedValue(ongoing);

      await service.confirmReturn(
        ongoing.id,
        admin.userId,
        { condition: DeviceCondition.intact, damageFee: 500_000 },
        [],
      );

      expect(lastBookingUpdate().data).toEqual(
        expect.objectContaining({ damageFeeAmount: 0 }),
      );
    });

    it.each([
      ['thiếu mô tả', { damageFee: 100_000 }, [file], 'mô tả hư hỏng'],
      [
        'thiếu số tiền',
        { damageDescription: 'Trầy' },
        [file],
        'số tiền bồi thường',
      ],
      [
        'thiếu ảnh minh chứng',
        { damageDescription: 'Trầy', damageFee: 100_000 },
        [],
        'ảnh minh chứng',
      ],
      [
        'bồi thường vượt giá trị thiết bị',
        { damageDescription: 'Mất máy', damageFee: 25_000_000 },
        [file],
        'vượt quá giá trị thiết bị',
      ],
    ])(
      'hư hỏng nhưng %s → chặn, không ghi gì',
      async (_label, extra, files, message) => {
        prisma.booking.findUnique.mockResolvedValue(ongoing);

        await expect(
          service.confirmReturn(
            ongoing.id,
            admin.userId,
            { condition: DeviceCondition.damaged, ...extra },
            files,
          ),
        ).rejects.toThrow(message);
        expect(prisma.booking.update).not.toHaveBeenCalled();
        expect(prisma.device.update).not.toHaveBeenCalled();
      },
    );

    it('chỉ nhận lại máy cho đơn đang thuê', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...ongoing,
        status: BookingStatus.confirmed,
      });

      await expect(
        service.confirmReturn(
          ongoing.id,
          admin.userId,
          { condition: DeviceCondition.intact },
          [],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('previewReturn', () => {
    it('xem trước bảng khấu trừ bằng đúng công thức quyết toán', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.ongoing,
        depositAmount: '1000000',
        endTime: new Date(Date.now() - 12 * 3600 * 1000),
      });

      await expect(
        service.previewReturn(baseBooking.id, 1_200_000),
      ).resolves.toEqual({
        depositAmount: 1_000_000,
        lateFee: 16_000,
        damageFee: 1_200_000,
        repairFee: 0,
        totalDeductions: 1_216_000,
        refundAmount: 0,
        amountOwed: 216_000,
      });
    });
  });

  describe('markDepositRefunded — hoàn cọc thủ công', () => {
    it('pending → refunded, lưu mã giao dịch, đánh dấu payment, báo khách', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.completed,
        depositRefundStatus: DepositRefundStatus.pending,
        depositRefundAmount: '9000000',
      });

      await service.markDepositRefunded(
        baseBooking.id,
        admin.userId,
        ' FT123 ',
      );

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: baseBooking.id },
        data: expect.objectContaining({
          depositRefundStatus: DepositRefundStatus.refunded,
          depositRefundTxnRef: 'FT123',
          depositRefundedById: admin.userId,
          depositRefundedAt: expect.any(Date),
        }),
      });
      expect(paymentsService.markDepositPaymentRefunded).toHaveBeenCalledWith(
        baseBooking.id,
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        baseBooking.userId,
        expect.objectContaining({ type: 'booking_deposit_refunded' }),
      );
    });

    it('chặn khi đơn không có khoản cọc chờ hoàn (đã hoàn / không hoàn)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        depositRefundStatus: DepositRefundStatus.refunded,
      });

      await expect(
        service.markDepositRefunded(baseBooking.id, admin.userId, 'FT1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });
  });

  describe('getFinancialStats', () => {
    it('tách riêng các khoản tiền, BỎ đơn dữ liệu mẫu (isDemo) khỏi mọi số liệu', async () => {
      prisma.booking.aggregate
        .mockResolvedValueOnce({
          _sum: { totalPrice: '1500000', rentalRefundAmount: '200000' },
        })
        .mockResolvedValueOnce({
          _sum: {
            lateFeeAmount: '48000',
            damageFeeAmount: '3000000',
            repairFeeAmount: '500000',
          },
        })
        .mockResolvedValueOnce({ _sum: { depositAmount: '20000000' } })
        .mockResolvedValueOnce({ _sum: { depositRefundAmount: '7000000' } })
        .mockResolvedValueOnce({
          _sum: { amountOwed: '1216000', debtPaidAmount: '1000000' },
        });
      prisma.booking.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      (prisma.device as any).count = jest.fn().mockResolvedValue(3);
      (prisma as any).deviceIssueReport = {
        count: jest.fn().mockResolvedValue(4),
      };

      await expect(service.getFinancialStats()).resolves.toEqual({
        rentalRevenue: 1_300_000,
        lateFees: 48_000,
        damageFees: 3_500_000,
        depositHeld: 27_000_000,
        outstandingDebt: 216_000,
        debtCollected: 1_000_000,
        pendingRefundCount: 2,
        overdueRefundCount: 1,
        suspectedLostCount: 1,
        lostDeviceCount: 3,
        openIssueCount: 4,
      });
      for (const [args] of prisma.booking.aggregate.mock.calls) {
        expect(args.where).toMatchObject({ isDemo: false });
      }
    });
  });

  describe('getContractForPrint', () => {
    it('sinh hợp đồng với CCCD giải mã ĐẦY ĐỦ (khác bản lưu masked)', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);

      const result = await service.getContractForPrint(baseBooking.id);

      expect(usersService.revealCccd).toHaveBeenCalledWith(
        baseBooking.userId,
        '5',
      );
      expect(result.content).toContain('001234000000');
      expect(result.content).not.toContain('********0000');
      expect(result.signed).toBe(false);
    });

    it('ném NotFoundException nếu booking không tồn tại', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(service.getContractForPrint('ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('setContractSigned', () => {
    it('đánh dấu đã ký kèm thời điểm ký', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        contractSigned: true,
        contractSignedAt: new Date(),
      });

      const result = await service.setContractSigned(baseBooking.id, true);

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: baseBooking.id },
        data: { contractSigned: true, contractSignedAt: expect.any(Date) },
      });
      expect(result.contractSigned).toBe(true);
    });

    it('bỏ đánh dấu ký thì xoá luôn thời điểm ký', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        contractSigned: false,
        contractSignedAt: null,
      });

      await service.setContractSigned(baseBooking.id, false);

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: baseBooking.id },
        data: { contractSigned: false, contractSignedAt: null },
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
      expect(realtimeGateway.emitDeviceStatusChanged).not.toHaveBeenCalled();
      expect(notificationsService.create).toHaveBeenCalledWith(
        booking.userId,
        expect.objectContaining({ type: 'booking_cancelled' }),
      );
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

    it('tính đúng refundAmount = depositAmount * refundPercentage (đơn đã thu cọc)', async () => {
      const booking = {
        ...baseBooking,
        status: BookingStatus.confirmed,
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

  describe('cancel — hoàn cọc thủ công + giải phóng thiết bị', () => {
    it('đơn đã thu cọc: đặt "chờ hoàn" kèm hạn 3 ngày làm việc, KHÔNG tự đánh dấu đã hoàn', async () => {
      const booking = {
        ...baseBooking,
        status: BookingStatus.confirmed,
        depositAmount: '9000',
        startTime: new Date(Date.now() + 30 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue(booking);

      await service.cancel(booking.id, customer, {});

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: booking.id },
        data: expect.objectContaining({
          status: BookingStatus.cancelled,
          depositRefundAmount: 9000,
          depositRefundStatus: DepositRefundStatus.pending,
          depositRefundDueAt: expect.any(Date),
        }),
      });
      expect(paymentsService.markDepositPaymentRefunded).not.toHaveBeenCalled();
    });

    it('đơn đã thu cọc nhưng huỷ sát giờ (0%): "không hoàn cọc"', async () => {
      const booking = {
        ...baseBooking,
        status: BookingStatus.confirmed,
        startTime: new Date(Date.now() + 2 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue(booking);

      await service.cancel(booking.id, customer, {});

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: booking.id },
        data: expect.objectContaining({
          depositRefundStatus: DepositRefundStatus.not_refunded,
          depositRefundDueAt: null,
        }),
      });
    });

    it('đơn chưa thu cọc (pending): không động tới trạng thái hoàn cọc', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.booking.update.mockResolvedValue(baseBooking);

      await service.cancel(baseBooking.id, customer, {});

      const data = prisma.booking.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('depositRefundStatus');
    });

    it('khách KHÔNG tự huỷ được đơn đang thuê (đang giữ máy)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.ongoing,
      });

      await expect(
        service.cancel(baseBooking.id, customer, {}),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });

    it('staff/admin huỷ đơn đang thuê: thiết bị về available + phát realtime + xoá cache', async () => {
      const booking = { ...baseBooking, status: BookingStatus.ongoing };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue(booking);

      await service.cancel(booking.id, admin, { reason: 'Khách đổi ý' });

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { status: DeviceStatus.available },
      });
      expect(realtimeGateway.emitDeviceStatusChanged).toHaveBeenCalledWith({
        deviceId,
        status: DeviceStatus.available,
      });
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
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
      expect(notificationsService.create).toHaveBeenCalledWith(
        baseBooking.userId,
        expect.objectContaining({ type: 'booking_cancelled' }),
      );
    });

    it('KHÔNG đụng vào booking đã confirmed (job TTL lẽ ra đã bị huỷ nhưng phòng hờ)', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });

      await service.expireIfStillPending(baseBooking.id);

      expect(prisma.booking.update).not.toHaveBeenCalled();
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
  });

  describe('xác nhận / từ chối ngay trong thông báo (lưu người xử lý + lý do)', () => {
    it('confirm() lưu id người xác nhận để thông báo hiện "Đã xác nhận bởi ..."', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.confirmed,
      });

      await service.confirm(baseBooking.id, admin.userId);

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: baseBooking.id },
        data: { status: BookingStatus.confirmed, confirmedById: admin.userId },
      });
    });

    it('admin từ chối kèm lý do: lưu người huỷ + lý do, báo khách "bởi cửa hàng" kèm lý do', async () => {
      const booking = {
        ...baseBooking,
        startTime: new Date(Date.now() + 48 * 3600 * 1000),
      };
      prisma.booking.findUnique.mockResolvedValue(booking);
      prisma.booking.update.mockResolvedValue({
        ...booking,
        status: BookingStatus.cancelled,
      });

      await service.cancel(booking.id, admin, {
        reason: '  Thiết bị đang bảo trì  ',
        storeFault: true,
      });

      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: booking.id },
        data: {
          status: BookingStatus.cancelled,
          cancelledById: admin.userId,
          cancellationReason: 'Thiết bị đang bảo trì',
        },
      });
      expect(notificationsService.create).toHaveBeenCalledWith(
        booking.userId,
        expect.objectContaining({
          type: 'booking_cancelled',
          title: 'Đơn thuê bị từ chối/huỷ',
          message: expect.stringContaining('Lý do: Thiết bị đang bảo trì.'),
        }),
      );
    });

    it('đơn chưa thu cọc (pending) bị từ chối: KHÔNG nhắc hoàn tiền trong thông báo', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.booking.update.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.cancelled,
      });

      await service.cancel(baseBooking.id, admin, { storeFault: true });

      const content = notificationsService.create.mock.calls[0][1];
      expect(content.message).not.toContain('Hoàn');
    });

    it('khách không huỷ được đơn của người khác (phân quyền phía server)', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      await expect(
        service.cancel(baseBooking.id, otherCustomer, { reason: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.booking.update).not.toHaveBeenCalled();
    });
  });
});
