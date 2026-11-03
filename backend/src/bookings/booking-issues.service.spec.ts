import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  BookingStatus,
  DepositRefundStatus,
  DeviceStatus,
  IssueReportStatus,
  IssueResolution,
  Role,
} from '../generated/prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { BookingIssuesService } from './booking-issues.service';

describe('BookingIssuesService', () => {
  const customer: RequestUser = {
    userId: 'user-1',
    email: 'a@example.com',
    role: Role.customer,
  };
  const file = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' };

  const oldDevice = {
    id: 'dev-old',
    name: 'Sony A7 IV',
    categoryId: 'cat-1',
    status: DeviceStatus.rented,
    isDiscontinued: false,
    originalPrice: '50000000',
    pricePerDay: '400000',
  };
  const newDevice = {
    ...oldDevice,
    id: 'dev-new',
    name: 'Sony A7 III',
    status: DeviceStatus.available,
    originalPrice: '45000000',
  };
  const booking = {
    id: 'booking-1',
    userId: customer.userId,
    deviceId: oldDevice.id,
    status: BookingStatus.ongoing,
    startTime: new Date(Date.now() - 24 * 3600 * 1000),
    endTime: new Date(Date.now() + 72 * 3600 * 1000),
    totalPrice: '1600000',
    depositAmount: '25000000',
  };
  const openReport = {
    id: 'report-1',
    bookingId: booking.id,
    reportedById: customer.userId,
    deviceId: oldDevice.id,
    description: 'Máy không lấy nét được',
    status: IssueReportStatus.open,
    booking: { ...booking, device: oldDevice, user: { name: 'Khách A' } },
  };

  let tx: any;
  let prisma: any;
  let uploadService: {
    uploadIssueMedia: jest.Mock;
    uploadInspectionImages: jest.Mock;
  };
  let bookingsService: any;
  let service: BookingIssuesService;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      booking: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(booking),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      device: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(oldDevice),
        findUnique: jest.fn().mockResolvedValue(newDevice),
        update: jest.fn(),
      },
      maintenance: { create: jest.fn() },
      bookingInspection: {
        findUnique: jest.fn().mockResolvedValue({ images: ['old-1.jpg'] }),
        upsert: jest.fn(),
      },
      deviceIssueReport: { update: jest.fn() },
    };
    prisma = {
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (t: unknown) => Promise<unknown>)(tx)
          : Promise.all(arg as Promise<unknown>[]),
      ),
      deviceIssueReport: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(openReport),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'report-new', ...data })),
        update: jest.fn(),
      },
      device: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(oldDevice),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      booking: { update: jest.fn() },
      maintenance: { create: jest.fn() },
    };
    uploadService = {
      uploadIssueMedia: jest.fn().mockResolvedValue(['https://img/issue.mp4']),
      uploadInspectionImages: jest
        .fn()
        .mockResolvedValue(['n1.jpg', 'n2.jpg', 'n3.jpg']),
    };
    bookingsService = {
      findByIdOrThrow: jest.fn().mockResolvedValue(booking),
      notifyStaff: jest.fn().mockResolvedValue(undefined),
      notifyCustomer: jest.fn().mockResolvedValue(undefined),
      afterDeviceStatusChanged: jest.fn().mockResolvedValue(undefined),
      generateAndSaveContract: jest.fn().mockResolvedValue(undefined),
    };
    service = new BookingIssuesService(
      prisma,
      uploadService as any,
      bookingsService,
    );
  });

  describe('report — khách báo lỗi', () => {
    it('chủ đơn đang thuê báo lỗi: lưu ảnh/video và báo staff/admin', async () => {
      const report = await service.report(
        booking.id,
        customer,
        '  Máy không lấy nét  ',
        [file],
      );
      expect(report.media).toEqual(['https://img/issue.mp4']);
      expect(report.description).toBe('Máy không lấy nét');
      expect(bookingsService.notifyStaff).toHaveBeenCalledWith(
        booking.id,
        expect.objectContaining({ kind: 'issue_reported' }),
      );
    });

    it('khách khác không báo lỗi được đơn người khác', async () => {
      await expect(
        service.report(
          booking.id,
          { ...customer, userId: 'user-2' },
          'Máy hỏng màn hình',
          [],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('chỉ báo lỗi cho đơn đang thuê', async () => {
      bookingsService.findByIdOrThrow.mockResolvedValue({
        ...booking,
        status: BookingStatus.confirmed,
      });
      await expect(
        service.report(booking.id, customer, 'Máy hỏng màn hình', []),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('đã có báo lỗi chưa xử lý → chặn gửi thêm', async () => {
      prisma.deviceIssueReport.findFirst.mockResolvedValue({ id: 'r' });
      await expect(
        service.report(booking.id, customer, 'Máy hỏng màn hình', []),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findReplacementCandidates', () => {
    it('chỉ trả máy có giá trị tương đương, gần giá máy gốc nhất trước', async () => {
      prisma.device.findMany.mockResolvedValue([
        { ...newDevice, id: 'far', originalPrice: '41000000' },
        { ...newDevice, id: 'too-expensive', originalPrice: '70000000' },
        { ...newDevice, id: 'near', originalPrice: '52000000' },
      ]);
      const result = await service.findReplacementCandidates(booking.id);
      expect(result.map((d) => d.id)).toEqual(['near', 'far']);
      // Lọc trùng lịch trên đúng khung giờ của đơn, bỏ chính đơn này.
      expect(prisma.device.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          categoryId: 'cat-1',
          status: DeviceStatus.available,
          isDiscontinued: false,
          bookings: {
            none: expect.objectContaining({
              id: { not: booking.id },
              startTime: { lt: booking.endTime },
              endTime: { gt: booking.startTime },
            }),
          },
        }),
      });
    });

    it('không có máy trống → danh sách rỗng', async () => {
      await expect(
        service.findReplacementCandidates(booking.id),
      ).resolves.toEqual([]);
    });
  });

  describe('resolve — đổi máy', () => {
    const dto = {
      resolution: IssueResolution.swapped,
      replacementDeviceId: newDevice.id,
    };

    it('khoá cả 2 máy (FOR UPDATE), đổi máy, máy cũ → bảo trì, máy mới → đang thuê', async () => {
      await service.resolve(openReport.id, 'admin-1', dto, [file, file, file]);

      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(tx.booking.update).toHaveBeenCalledWith({
        where: { id: booking.id },
        data: { deviceId: newDevice.id },
      });
      expect(tx.device.update).toHaveBeenCalledWith({
        where: { id: oldDevice.id },
        data: { status: DeviceStatus.maintenance },
      });
      expect(tx.device.update).toHaveBeenCalledWith({
        where: { id: newDevice.id },
        data: { status: DeviceStatus.rented },
      });
      expect(tx.maintenance.create).toHaveBeenCalled();
      expect(tx.deviceIssueReport.update).toHaveBeenCalledWith({
        where: { id: openReport.id },
        data: expect.objectContaining({
          status: IssueReportStatus.resolved,
          resolution: IssueResolution.swapped,
          replacementDeviceId: newDevice.id,
          previousHandoverImages: ['old-1.jpg'],
        }),
      });
      expect(bookingsService.afterDeviceStatusChanged).toHaveBeenCalledWith(
        oldDevice.id,
        DeviceStatus.maintenance,
      );
      expect(bookingsService.afterDeviceStatusChanged).toHaveBeenCalledWith(
        newDevice.id,
        DeviceStatus.rented,
      );
      expect(bookingsService.notifyCustomer).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          kind: 'issue_resolved',
          resolution: 'swapped',
        }),
      );
    });

    it('máy thay thế đã có lịch trùng → 409, không đổi gì', async () => {
      tx.booking.findFirst.mockResolvedValue({ id: 'other-booking' });
      await expect(
        service.resolve(openReport.id, 'admin-1', dto, [file, file, file]),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.booking.update).not.toHaveBeenCalled();
      expect(bookingsService.afterDeviceStatusChanged).not.toHaveBeenCalled();
    });

    it('exclusion constraint chặn ở tầng DB → dịch thành 409', async () => {
      tx.booking.update.mockRejectedValue(
        new Error('violates exclusion constraint "no_overlapping_bookings"'),
      );
      await expect(
        service.resolve(openReport.id, 'admin-1', dto, [file, file, file]),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('máy thay thế không tương đương (khác danh mục / đang thuê) → chặn', async () => {
      tx.device.findUnique.mockResolvedValue({
        ...newDevice,
        status: DeviceStatus.rented,
      });
      await expect(
        service.resolve(openReport.id, 'admin-1', dto, [file, file, file]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('thiếu ảnh biên bản máy mới → chặn trước khi upload', async () => {
      await expect(
        service.resolve(openReport.id, 'admin-1', dto, [file]),
      ).rejects.toThrow('tối thiểu 3 ảnh');
      expect(uploadService.uploadInspectionImages).not.toHaveBeenCalled();
    });
  });

  describe('resolve — kết thúc sớm', () => {
    it('hoàn tiền thuê phần chưa dùng + đủ cọc, máy → bảo trì', async () => {
      await service.resolve(
        openReport.id,
        'admin-1',
        { resolution: IssueResolution.ended_early },
        [],
      );

      const call = prisma.booking.update.mock.calls[0][0];
      // Thuê 4 ngày, đã dùng ~1 ngày → hoàn ~3/4 của 1.600.000, làm tròn xuống nghìn.
      expect(call.data.rentalRefundAmount).toBeGreaterThanOrEqual(1_199_000);
      expect(call.data.rentalRefundAmount).toBeLessThanOrEqual(1_200_000);
      expect(call.data.rentalRefundAmount % 1000).toBe(0);
      expect(call.data).toEqual(
        expect.objectContaining({
          status: BookingStatus.completed,
          depositRefundAmount: 25_000_000,
          depositRefundStatus: DepositRefundStatus.pending,
          depositRefundDueAt: expect.any(Date),
        }),
      );
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: oldDevice.id },
        data: { status: DeviceStatus.maintenance },
      });
      expect(bookingsService.afterDeviceStatusChanged).toHaveBeenCalledWith(
        oldDevice.id,
        DeviceStatus.maintenance,
      );
    });
  });

  describe('resolve — lỗi do khách', () => {
    it('cộng chi phí sửa vào đơn để trừ vào cọc khi trả máy', async () => {
      await service.resolve(
        openReport.id,
        'admin-1',
        { resolution: IssueResolution.customer_fault, repairCost: 1_500_000 },
        [],
      );
      expect(prisma.booking.update).toHaveBeenCalledWith({
        where: { id: booking.id },
        data: { repairFeeAmount: { increment: 1_500_000 } },
      });
      expect(prisma.device.update).not.toHaveBeenCalled();
    });

    it('thiếu chi phí sửa → chặn', async () => {
      await expect(
        service.resolve(
          openReport.id,
          'admin-1',
          { resolution: IssueResolution.customer_fault },
          [],
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('báo lỗi đã xử lý thì không xử lý lại', async () => {
    prisma.deviceIssueReport.findUnique.mockResolvedValue({
      ...openReport,
      status: IssueReportStatus.resolved,
    });
    await expect(
      service.resolve(
        openReport.id,
        'admin-1',
        { resolution: IssueResolution.ended_early },
        [],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
