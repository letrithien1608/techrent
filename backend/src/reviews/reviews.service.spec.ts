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
    };
  };

  const userId = 'user-1';
  const bookingId = 'booking-1';
  const baseBooking = {
    id: bookingId,
    userId,
    status: BookingStatus.completed,
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      booking: { findUnique: jest.fn() },
      review: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new ReviewsService(prisma as unknown as PrismaService);
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
