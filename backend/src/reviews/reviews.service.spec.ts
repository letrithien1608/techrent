import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesCacheService } from '../devices/devices-cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BookingStatus, Prisma, Role } from '../generated/prisma/client';
import { REVIEW_EDITS_PER_DAY, storeDayKey } from '../common/business-policy';
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
    user: { findUnique: jest.Mock; findMany: jest.Mock };
    device: { findUnique: jest.Mock; update: jest.Mock };
    booking: { groupBy: jest.Mock };
    review: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      aggregate: jest.Mock;
      groupBy: jest.Mock;
    };
  };
  let devicesCacheService: { invalidateAll: jest.Mock };
  let notificationsService: { create: jest.Mock };

  const userId = 'user-1';
  const deviceId = 'device-1';
  const comment = 'Máy chạy rất ổn định, giao nhận nhanh';
  const device = { id: deviceId, name: 'Sony A7 IV', images: ['img.jpg'] };
  const ownReview = {
    id: 'review-1',
    userId,
    deviceId,
    bookingId: null,
    rating: 4,
    comment,
    isHidden: false,
    deletedAt: null as Date | null,
    deleteReason: null as string | null,
    editDay: null as string | null,
    editCount: 0,
  };
  const customer = { isBlacklisted: false, role: Role.customer };

  function uniqueError() {
    return new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the constraint: `uq_reviews_user_device`',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          driverAdapterError: {
            cause: { constraint: { index: 'uq_reviews_user_device' } },
          },
        },
      },
    );
  }

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => Promise<unknown>)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
      user: {
        findUnique: jest.fn().mockResolvedValue(customer),
        findMany: jest.fn().mockResolvedValue([]),
      },
      device: {
        findUnique: jest.fn().mockResolvedValue({ id: deviceId }),
        update: jest.fn(),
      },
      booking: { groupBy: jest.fn().mockResolvedValue([]) },
      review: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'review-1' }),
        create: jest.fn().mockResolvedValue({ id: 'review-new' }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'review-1', userId, deviceId }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    devicesCacheService = { invalidateAll: jest.fn() };
    notificationsService = { create: jest.fn() };
    service = new ReviewsService(
      prisma as unknown as PrismaService,
      devicesCacheService as unknown as DevicesCacheService,
      notificationsService as unknown as NotificationsService,
    );
  });

  function expectRatingRecalculated() {
    expect(prisma.review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isHidden: false, deletedAt: null, deviceId },
      }),
    );
    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: deviceId },
      data: { avgRating: 4.5, reviewCount: 2 },
    });
    expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
  }

  describe('create', () => {
    it('khách CHƯA thuê vẫn đánh giá được, không gắn booking', async () => {
      await service.create(userId, deviceId, { rating: 5, comment });
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: { userId, deviceId, rating: 5, comment },
      });
      expectRatingRecalculated();
    });

    it('đã có đánh giá → 409 (không tạo thêm)', async () => {
      prisma.review.findUnique.mockResolvedValue({ deletedAt: null });
      await expect(
        service.create(userId, deviceId, { rating: 5, comment }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it('2 request đồng thời: request thua bị unique constraint chặn → 409', async () => {
      prisma.review.create
        .mockResolvedValueOnce({ id: 'review-a' })
        .mockRejectedValueOnce(uniqueError());
      const results = await Promise.allSettled([
        service.create(userId, deviceId, { rating: 5, comment }),
        service.create(userId, deviceId, { rating: 4, comment }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(rejected?.reason).toBeInstanceOf(ConflictException);
    });

    it('đánh giá cũ bị quản trị xoá → không viết lại được (403, kèm lý do)', async () => {
      prisma.review.findUnique.mockResolvedValue({
        deletedAt: new Date(),
        deleteReason: 'Spam',
      });
      await expect(
        service.create(userId, deviceId, { rating: 5, comment }),
      ).rejects.toThrow(/quản trị viên xoá \(lý do: Spam\)/);
      expect(prisma.review.create).not.toHaveBeenCalled();
    });

    it.each([Role.staff, Role.admin])(
      '%s không được đánh giá',
      async (role) => {
        prisma.user.findUnique.mockResolvedValue({
          isBlacklisted: false,
          role,
        });
        await expect(
          service.create(userId, deviceId, { rating: 5, comment }),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.review.create).not.toHaveBeenCalled();
      },
    );

    it('chặn tài khoản trong danh sách đen', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...customer,
        isBlacklisted: true,
      });
      await expect(
        service.create(userId, deviceId, { rating: 5, comment }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('thiết bị không tồn tại → 404', async () => {
      prisma.device.findUnique.mockResolvedValue(null);
      await expect(
        service.create(userId, deviceId, { rating: 5, comment }),
      ).rejects.toThrow(NotFoundException);
    });

    it('nội dung vi phạm bị chặn trước khi chạm DB', async () => {
      await expect(
        service.create(userId, deviceId, {
          rating: 5,
          comment: 'xem thêm ở www.abc.com',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('chủ đánh giá sửa được sao + nội dung, tính lại điểm', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      await service.update(userId, 'review-1', { rating: 2, comment });
      expect(prisma.review.updateMany).toHaveBeenCalledTimes(1);
      expect(prisma.review.updateMany.mock.calls[0][0]).toMatchObject({
        where: {
          id: 'review-1',
          editDay: storeDayKey(new Date()),
          editCount: { lt: REVIEW_EDITS_PER_DAY },
        },
        data: { rating: 2, comment, editCount: { increment: 1 } },
      });
      expectRatingRecalculated();
    });

    it('lần sửa đầu tiên trong ngày → đặt lại bộ đếm = 1', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      prisma.review.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      await service.update(userId, 'review-1', { rating: 3 });
      expect(prisma.review.updateMany.mock.calls[1][0].data).toMatchObject({
        editDay: storeDayKey(new Date()),
        editCount: 1,
      });
    });

    it(`quá ${REVIEW_EDITS_PER_DAY} lần sửa/ngày → 429`, async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        editDay: storeDayKey(new Date()),
        editCount: REVIEW_EDITS_PER_DAY,
      });
      prisma.review.updateMany.mockResolvedValue({ count: 0 });
      const error = await service
        .update(userId, 'review-1', { rating: 3 })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(prisma.device.update).not.toHaveBeenCalled();
    });

    it('người khác không sửa được', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        userId: 'other',
      });
      await expect(
        service.update(userId, 'review-1', { rating: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('đánh giá đã bị quản trị xoá → không sửa được', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        deletedAt: new Date(),
      });
      await expect(
        service.update(userId, 'review-1', { rating: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('chặn danh sách đen khi sửa', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      prisma.user.findUnique.mockResolvedValue({
        ...customer,
        isBlacklisted: true,
      });
      await expect(
        service.update(userId, 'review-1', { rating: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('không có thay đổi → 400', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      await expect(service.update(userId, 'review-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove (khách tự xoá)', () => {
    it('xoá hẳn + tính lại điểm → sau đó viết lại được', async () => {
      prisma.review.findUnique.mockResolvedValueOnce(ownReview);
      await service.remove(userId, 'review-1');
      expect(prisma.review.delete).toHaveBeenCalledWith({
        where: { id: 'review-1' },
      });
      expectRatingRecalculated();

      prisma.review.findUnique.mockResolvedValue(null);
      await expect(
        service.create(userId, deviceId, { rating: 4, comment }),
      ).resolves.toEqual({ id: 'review-new' });
    });

    it('khách không xoá được đánh giá của người khác', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        userId: 'other',
      });
      await expect(service.remove(userId, 'review-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.review.delete).not.toHaveBeenCalled();
    });

    it('không tự xoá được đánh giá đã bị quản trị xoá (tránh vòng lặp spam)', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        deletedAt: new Date(),
      });
      await expect(service.remove(userId, 'review-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('moderatorDelete / restore / ẩn', () => {
    beforeEach(() => {
      prisma.review.findUnique.mockResolvedValue({ ...ownReview, device });
    });

    it('xoá mềm kèm lý do, tính lại điểm, báo người viết', async () => {
      await service.moderatorDelete('review-1', 'staff-1', '  Spam  ');
      expect(prisma.review.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'review-1' },
          data: {
            deletedAt: expect.any(Date) as unknown,
            deletedById: 'staff-1',
            deleteReason: 'Spam',
          },
        }),
      );
      expect(prisma.review.delete).not.toHaveBeenCalled();
      expectRatingRecalculated();
      expect(notificationsService.create).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          type: 'review_deleted',
          message: 'Đánh giá của bạn về Sony A7 IV đã bị xoá. Lý do: Spam',
        }),
      );
    });

    it('thiếu lý do → 400', async () => {
      await expect(
        service.moderatorDelete('review-1', 'staff-1', '   '),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.review.update).not.toHaveBeenCalled();
    });

    it('lỗi gửi thông báo không làm hỏng thao tác xoá', async () => {
      notificationsService.create.mockRejectedValue(new Error('down'));
      await expect(
        service.moderatorDelete('review-1', 'staff-1', 'Spam'),
      ).resolves.toBeDefined();
    });

    it('đã xoá rồi → 409', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        device,
        deletedAt: new Date(),
      });
      await expect(
        service.moderatorDelete('review-1', 'staff-1', 'Spam'),
      ).rejects.toThrow(ConflictException);
    });

    it('khôi phục: bỏ dấu xoá + tính lại điểm', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        deletedAt: new Date(),
      });
      await service.restore('review-1');
      expect(prisma.review.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { deletedAt: null, deletedById: null, deleteReason: null },
        }),
      );
      expectRatingRecalculated();
    });

    it('khôi phục đánh giá chưa bị xoá → 400', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      await expect(service.restore('review-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('ẩn đánh giá cũng tính lại điểm', async () => {
      prisma.review.findUnique.mockResolvedValue(ownReview);
      await service.setVisibility('review-1', 'staff-1', {
        hidden: true,
        reason: 'Ngôn từ xúc phạm',
      });
      expectRatingRecalculated();
    });

    it('ẩn mà không có lý do → 400', async () => {
      await expect(
        service.setVisibility('review-1', 'staff-1', { hidden: true }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMine', () => {
    it('chưa đánh giá → được viết mới', async () => {
      const state = await service.getMine(userId, deviceId);
      expect(state).toEqual({
        canCreate: true,
        canEdit: false,
        reason: null,
        review: null,
      });
    });

    it('đã có → được sửa, kèm số lượt sửa còn lại hôm nay + nhãn đã thuê', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        createdAt: new Date(),
        editedAt: null,
        hiddenReason: null,
        editDay: storeDayKey(new Date()),
        editCount: 2,
      });
      prisma.booking.groupBy.mockResolvedValue([
        { userId, deviceId, _max: { endTime: new Date() } },
      ]);
      const state = await service.getMine(userId, deviceId);
      expect(state.canCreate).toBe(false);
      expect(state.canEdit).toBe(true);
      expect(state.review).toMatchObject({
        verifiedRental: true,
        editsLeftToday: REVIEW_EDITS_PER_DAY - 2,
      });
    });

    it('bị quản trị xoá → không viết/sửa, có lý do', async () => {
      prisma.review.findUnique.mockResolvedValue({
        ...ownReview,
        deletedAt: new Date(),
        deleteReason: 'Quảng cáo',
      });
      const state = await service.getMine(userId, deviceId);
      expect(state).toMatchObject({
        canCreate: false,
        canEdit: false,
        reason: 'removed_by_moderator',
        review: { deleteReason: 'Quảng cáo' },
      });
    });

    it('nhân viên → reason staff', async () => {
      prisma.user.findUnique.mockResolvedValue({
        isBlacklisted: false,
        role: Role.staff,
      });
      const state = await service.getMine(userId, deviceId);
      expect(state).toMatchObject({ canCreate: false, reason: 'staff' });
    });
  });

  describe('findPublic', () => {
    const row = (id: string, user: string) => ({
      id,
      userId: user,
      deviceId,
      rating: 5,
      comment,
      createdAt: new Date(),
      editedAt: null,
      user: { name: 'Nguyễn Văn An', avatarUrl: null },
    });

    it('nhãn "đã thuê" tính từ đơn completed, tên được che', async () => {
      prisma.review.findMany.mockResolvedValue([
        row('r1', 'u1'),
        row('r2', 'u2'),
      ]);
      prisma.review.count.mockResolvedValue(2);
      const endTime = new Date('2026-10-01T00:00:00Z');
      prisma.booking.groupBy.mockResolvedValue([
        { userId: 'u1', deviceId, _max: { endTime } },
      ]);
      const result = await service.findPublic({
        page: 1,
        limit: 10,
        deviceId,
        sort: 'newest',
      });
      expect(prisma.booking.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: BookingStatus.completed,
            OR: [
              { userId: 'u1', deviceId },
              { userId: 'u2', deviceId },
            ],
          },
        }),
      );
      expect(result.data[0]).toMatchObject({
        reviewerName: 'Nguyễn V. A',
        verifiedRental: true,
        rentedAt: endTime,
      });
      expect(result.data[1]).toMatchObject({
        verifiedRental: false,
        rentedAt: null,
      });
      expect(result.data[0]).not.toHaveProperty('userId');
    });

    it('sắp xếp mặc định: người đã thuê trước, phân trang nối sang nhóm chưa thuê', async () => {
      // 3 đánh giá đã thuê + 4 chưa thuê, trang 1 cỡ 5 → 3 + 2.
      prisma.review.count.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
      prisma.review.findMany
        .mockResolvedValueOnce([row('a', 'u1'), row('b', 'u2'), row('c', 'u3')])
        .mockResolvedValueOnce([row('d', 'u4'), row('e', 'u5')]);
      const result = await service.findPublic({ page: 1, limit: 5, deviceId });
      expect(result.meta.total).toBe(7);
      expect(result.data.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
      const [rentedCall, otherCall] = prisma.review.findMany.mock.calls;
      expect(rentedCall[0].where.user).toEqual({
        bookings: { some: { deviceId, status: BookingStatus.completed } },
      });
      expect(otherCall[0]).toMatchObject({
        skip: 0,
        take: 2,
        where: {
          user: {
            bookings: { none: { deviceId, status: BookingStatus.completed } },
          },
        },
      });
    });

    it('trang sau khi đã hết nhóm đã thuê → bỏ qua đúng số dòng nhóm chưa thuê', async () => {
      prisma.review.count.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
      prisma.review.findMany.mockResolvedValueOnce([row('f', 'u6')]);
      await service.findPublic({ page: 2, limit: 5, deviceId });
      expect(prisma.review.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.review.findMany.mock.calls[0][0]).toMatchObject({
        skip: 2,
        take: 5,
      });
    });

    it('lọc "chỉ người đã thuê"', async () => {
      await service.findPublic({
        page: 1,
        limit: 5,
        deviceId,
        rentedOnly: true,
      });
      expect(prisma.review.findMany.mock.calls[0][0].where).toMatchObject({
        isHidden: false,
        deletedAt: null,
        user: {
          bookings: { some: { deviceId, status: BookingStatus.completed } },
        },
      });
    });
  });

  it('getSummary chỉ tính đánh giá đang hiển thị, chưa bị xoá', async () => {
    prisma.review.groupBy.mockResolvedValue([
      { rating: 5, _count: { _all: 2 } },
      { rating: 3, _count: { _all: 1 } },
    ]);
    prisma.review.count.mockResolvedValue(1);
    const summary = await service.getSummary(deviceId);
    expect(prisma.review.groupBy.mock.calls[0][0].where).toEqual({
      isHidden: false,
      deletedAt: null,
      deviceId,
    });
    expect(summary).toMatchObject({
      avgRating: 4.3,
      reviewCount: 3,
      rentedCount: 1,
      distribution: { 5: 2, 3: 1 },
    });
  });
});
