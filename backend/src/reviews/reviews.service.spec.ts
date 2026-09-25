import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '../generated/prisma/client';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: {
    $transaction: jest.Mock;
    booking: { findUnique: jest.Mock };
    review: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
    };
    device: { update: jest.Mock };
  };
  let devicesCacheService: { invalidateAll: jest.Mock };

  const userId = 'user-1';
  const bookingId = 'booking-1';
  const deviceId = 'device-1';
  const baseBooking = {
    id: bookingId,
    userId,
    deviceId,
    status: BookingStatus.completed,
  };

  beforeEach(() => {
    prisma = {
      // `create()` dùng $transaction dạng CALLBACK (như BookingsService) —
      // truyền thẳng `prisma` làm "tx" vì test không cần phân biệt client
      // trong/ngoài transaction, chỉ cần đúng mock nào được gọi với đúng dữ liệu.
      $transaction: jest.fn((arg: unknown) => {
        if (typeof arg === 'function') {
          return (arg as (tx: unknown) => Promise<unknown>)(prisma);
        }
        return Promise.all(arg as Promise<unknown>[]);
      }),
      booking: { findUnique: jest.fn() },
      review: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _avg: { rating: null },
          _count: { rating: 0 },
        }),
      },
      device: { update: jest.fn() },
    };
    devicesCacheService = { invalidateAll: jest.fn().mockResolvedValue(undefined) };
    service = new ReviewsService(
      prisma as unknown as PrismaService,
      devicesCacheService as any,
    );
  });

  describe('create', () => {
    it('ném NotFoundException nếu không tìm thấy booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(null);
      await expect(
        service.create(userId, { bookingId, rating: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ném ForbiddenException nếu không phải chủ booking', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      await expect(
        service.create('other-user', { bookingId, rating: 5 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ném BadRequestException nếu booking chưa completed', async () => {
      prisma.booking.findUnique.mockResolvedValue({
        ...baseBooking,
        status: BookingStatus.ongoing,
      });
      await expect(
        service.create(userId, { bookingId, rating: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ném ConflictException nếu booking đã được đánh giá rồi', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.review.findUnique.mockResolvedValue({ id: 'review-1' });
      await expect(
        service.create(userId, { bookingId, rating: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('tạo review thành công với booking hợp lệ, chưa từng đánh giá', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue({
        id: 'review-1',
        bookingId,
        rating: 5,
        comment: 'Tốt',
      });

      const result = await service.create(userId, {
        bookingId,
        rating: 5,
        comment: 'Tốt',
      });

      expect(result.id).toBe('review-1');
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: { bookingId, rating: 5, comment: 'Tốt' },
      });
    });

    it('review ĐẦU TIÊN của thiết bị: cập nhật avgRating/reviewCount đúng bằng chính review đó', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue({
        id: 'review-1',
        bookingId,
        rating: 5,
        comment: null,
      });
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 5 },
        _count: { rating: 1 },
      });

      await service.create(userId, { bookingId, rating: 5 });

      expect(prisma.review.aggregate).toHaveBeenCalledWith({
        where: { booking: { deviceId } },
        _avg: { rating: true },
        _count: { rating: true },
      });
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { avgRating: 5, reviewCount: 1 },
      });
    });

    it('nhiều review cùng thiết bị: avgRating lấy ĐÚNG kết quả trung bình đã tính (aggregate)', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue({
        id: 'review-2',
        bookingId,
        rating: 4,
        comment: null,
      });
      // Giả lập: thiết bị đã có 1 review 5 sao từ trước, vừa thêm review 4 sao
      // -> trung bình 2 review là 4.5, reviewCount = 2 (Postgres AVG() tự tính
      // đúng, service chỉ cần TRUYỀN ĐÚNG kết quả xuống Device.update).
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { rating: 2 },
      });

      await service.create(userId, { bookingId, rating: 4 });

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { avgRating: 4.5, reviewCount: 2 },
      });
    });

    it('xoá cache danh sách thiết bị sau khi cập nhật avgRating', async () => {
      prisma.booking.findUnique.mockResolvedValue(baseBooking);
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue({
        id: 'review-1',
        bookingId,
        rating: 5,
        comment: null,
      });

      await service.create(userId, { bookingId, rating: 5 });

      expect(devicesCacheService.invalidateAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAll', () => {
    it('lọc theo deviceId qua quan hệ booking khi có truyền deviceId', async () => {
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, deviceId: 'device-1' });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { booking: { deviceId: 'device-1' } },
        }),
      );
    });

    it('lọc theo bookingId khi có truyền bookingId (VD kiểm tra 1 booking đã được đánh giá chưa)', async () => {
      prisma.review.findMany.mockResolvedValue([]);
      prisma.review.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, bookingId: 'booking-1' });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { bookingId: 'booking-1' },
        }),
      );
    });
  });
});
