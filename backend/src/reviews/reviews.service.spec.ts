import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '../generated/prisma/client';
import { ReviewsService } from './reviews.service';
import { maskReviewerName, sanitizeReviewComment } from './review-content.util';

describe('review-content.util', () => {
  it('che tên người đánh giá: giữ họ, các chữ sau lấy chữ cái đầu', () => {
    expect(maskReviewerName('Nguyễn Văn An')).toBe('Nguyễn V. A');
    expect(maskReviewerName('  Trần   bình ')).toBe('Trần B');
    expect(maskReviewerName('Linh')).toBe('L.');
    expect(maskReviewerName('')).toBe('Khách hàng');
  });

  it('gọn khoảng trắng và chấp nhận nội dung hợp lệ', () => {
    expect(sanitizeReviewComment('  Máy   chạy rất êm, pin tốt  ')).toBe(
      'Máy chạy rất êm, pin tốt',
    );
  });

  it.each([
    ['quá ngắn', 'Tốt lắm'],
    ['quá dài', 'a b '.repeat(400)],
    ['có link', 'Mua rẻ hơn tại https://abc.example nhé bạn'],
    ['có tên miền', 'Xem thêm ở shopgiare.vn để có giá tốt'],
    ['ký tự lặp', 'Tuyệt vờiiiiiiii luôn mọi người'],
  ])('chặn nội dung %s', (_label, comment) => {
    expect(() => sanitizeReviewComment(comment)).toThrow(BadRequestException);
  });
});

describe('ReviewsService', () => {
  let service: ReviewsService;
  let prisma: {
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock };
    device: { findUnique: jest.Mock; update: jest.Mock };
    booking: { findFirst: jest.Mock };
    review: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let devicesCacheService: { invalidateAll: jest.Mock };

  const userId = 'user-1';
  const deviceId = 'device-1';
  const comment = 'Máy chạy rất ổn định, giao nhận nhanh';
  const ownReview = {
    id: 'review-1',
    userId,
    deviceId,
    bookingId: 'booking-1',
    rating: 4,
    comment,
    isHidden: false,
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
      user: {
        findUnique: jest.fn().mockResolvedValue({ isBlacklisted: false }),
      },
      device: {
        findUnique: jest.fn().mockResolvedValue({ id: deviceId }),
        update: jest.fn(),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue({ id: 'booking-1' }),
      },
      review: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'review-new' }),
        update: jest.fn().mockResolvedValue({ id: 'review-1' }),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({
          _avg: { rating: 4.5 },
          _count: { rating: 2 },
        }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };
    devicesCacheService = {
      invalidateAll: jest.fn().mockResolvedValue(undefined),
    };
    service = new ReviewsService(
      prisma as unknown as PrismaService,
      devicesCacheService as any,
    );
  });

  describe('create', () => {
    const dto = { deviceId, rating: 5, comment };

    it('chỉ người đã thuê VÀ trả thiết bị (đơn completed) mới được đánh giá', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      await expect(service.create(userId, dto)).rejects.toThrow(
        'Bạn cần thuê và trả thiết bị này để đánh giá',
      );
      expect(prisma.booking.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId, deviceId, status: BookingStatus.completed },
        }),
      );
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('chặn tài khoản trong danh sách đen', async () => {
      prisma.user.findUnique.mockResolvedValue({ isBlacklisted: true });
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('chặn nội dung spam trước khi chạm DB', async () => {
      await expect(
        service.create(userId, { ...dto, comment: 'vào www.abc.com' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.booking.findFirst).not.toHaveBeenCalled();
    });

    it('404 khi thiết bị không tồn tại', async () => {
      prisma.device.findUnique.mockResolvedValue(null);
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('mỗi khách chỉ 1 đánh giá cho 1 thiết bị', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      await expect(service.create(userId, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('tạo đánh giá gắn đơn đã trả, tính lại rating trong cùng transaction rồi xoá cache', async () => {
      await service.create(userId, dto);

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          bookingId: 'booking-1',
          userId,
          deviceId,
          rating: 5,
          comment,
        },
      });
      expect(prisma.review.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deviceId, isHidden: false } }),
      );
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { avgRating: 4.5, reviewCount: 2 },
      });
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
    });
  });

  describe('update/remove', () => {
    it('chỉ chủ đánh giá được sửa', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      await expect(
        service.update('other-user', ownReview.id, { rating: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.remove('other-user', ownReview.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sửa → đánh dấu đã chỉnh sửa, tính lại rating', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      await service.update(userId, ownReview.id, { rating: 2 });
      expect(prisma.review.update).toHaveBeenCalledWith({
        where: { id: ownReview.id },
        data: { rating: 2, editedAt: expect.any(Date) },
      });
      expect(prisma.device.update).toHaveBeenCalled();
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
    });

    it('xoá → tính lại rating của thiết bị', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      prisma.review.aggregate.mockResolvedValue({
        _avg: { rating: null },
        _count: { rating: 0 },
      });
      await service.remove(userId, ownReview.id);
      expect(prisma.review.delete).toHaveBeenCalledWith({
        where: { id: ownReview.id },
      });
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { avgRating: null, reviewCount: 0 },
      });
    });
  });

  describe('setVisibility', () => {
    it('bắt buộc lý do khi ẩn', async () => {
      await expect(
        service.setVisibility('review-1', 'admin-1', { hidden: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ẩn đánh giá kèm lý do + tính lại rating (bỏ đánh giá ẩn)', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      await service.setVisibility('review-1', 'admin-1', {
        hidden: true,
        reason: ' Ngôn từ xúc phạm ',
      });
      expect(prisma.review.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            isHidden: true,
            hiddenReason: 'Ngôn từ xúc phạm',
            hiddenAt: expect.any(Date),
            hiddenById: 'admin-1',
          },
        }),
      );
      expect(prisma.device.update).toHaveBeenCalled();
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
    });
  });

  describe('đọc công khai', () => {
    it('chỉ trả đánh giá đang hiển thị, tên đã che, không lộ userId', async () => {
      prisma.review.findMany.mockResolvedValue([
        {
          ...ownReview,
          createdAt: new Date(),
          editedAt: null,
          user: { name: 'Nguyễn Văn An' },
          booking: { endTime: new Date('2026-10-01') },
        },
      ]);
      prisma.review.count.mockResolvedValue(1);

      const result = await service.findPublic({
        page: 1,
        limit: 10,
        deviceId,
        rating: 4,
        sort: 'lowest',
      });

      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isHidden: false, deviceId, rating: 4 },
          orderBy: [{ rating: 'asc' }, { createdAt: 'desc' }],
        }),
      );
      expect(result.data[0]).toMatchObject({
        reviewerName: 'Nguyễn V. A',
        verifiedRental: true,
      });
      expect(result.data[0]).not.toHaveProperty('userId');
    });

    it('tóm tắt: trung bình + phân bố theo số sao', async () => {
      prisma.review.groupBy.mockResolvedValue([
        { rating: 5, _count: { _all: 3 } },
        { rating: 3, _count: { _all: 1 } },
      ]);
      const summary = await service.getSummary(deviceId);
      expect(summary).toEqual({
        deviceId,
        avgRating: 4.5,
        reviewCount: 4,
        distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 3 },
      });
    });

    it('quyền đánh giá: chưa trả máy → not_rented, kèm đánh giá cũ nếu có', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      const result = await service.getEligibility(userId, deviceId);
      expect(result).toEqual({
        canReview: false,
        reason: 'not_rented',
        review: null,
      });
    });
  });
});
