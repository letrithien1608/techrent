import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesCacheService } from '../devices/devices-cache.service';
import { BookingStatus, Prisma } from '../generated/prisma/client';
import { translateUniqueConstraintError } from '../common/prisma-error.util';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { SetReviewVisibilityDto } from './dto/set-review-visibility.dto';
import type { ReviewSort } from './dto/list-reviews-query.dto';
import { maskReviewerName, sanitizeReviewComment } from './review-content.util';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListReviewsFilter {
  page: number;
  limit: number;
  deviceId?: string;
  sort?: ReviewSort;
  rating?: number;
}

export interface ListAdminReviewsFilter extends ListReviewsFilter {
  hidden?: boolean;
  search?: string;
}

/** Đánh giá hiển thị công khai — KHÔNG có userId/email, tên đã che. */
export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  editedAt: Date | null;
  reviewerName: string;
  /** Luôn true: chỉ người đã thuê và trả thiết bị mới đánh giá được. */
  verifiedRental: true;
  /** Ngày kết thúc đơn thuê làm căn cứ đánh giá. */
  rentedAt: Date;
}

export interface FeaturedReview extends PublicReview {
  device: { id: string; name: string; image: string | null };
}

export interface ReviewSummary {
  deviceId: string;
  avgRating: number | null;
  reviewCount: number;
  /** Số đánh giá theo từng mức sao 1..5 (chỉ đánh giá đang hiển thị). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export type IneligibleReason = 'not_rented' | 'blacklisted';

export interface ReviewEligibility {
  canReview: boolean;
  reason: IneligibleReason | null;
  /** Đánh giá của chính người dùng cho thiết bị này (kể cả đang bị ẩn). */
  review: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
    editedAt: Date | null;
    isHidden: boolean;
    hiddenReason: string | null;
  } | null;
}

const publicInclude = {
  user: { select: { name: true } },
  booking: { select: { endTime: true } },
} satisfies Prisma.ReviewInclude;

type ReviewWithAuthor = Prisma.ReviewGetPayload<{
  include: typeof publicInclude;
}>;

const adminInclude = {
  user: { select: { id: true, name: true, email: true } },
  device: { select: { id: true, name: true, images: true } },
  booking: { select: { id: true, endTime: true } },
} satisfies Prisma.ReviewInclude;

const ORDER_BY: Record<ReviewSort, Prisma.ReviewOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  highest: [{ rating: 'desc' }, { createdAt: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }],
};

const NOT_RENTED_MESSAGE = 'Bạn cần thuê và trả thiết bị này để đánh giá';

function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

function toPublic(review: ReviewWithAuthor): PublicReview {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    editedAt: review.editedAt,
    reviewerName: maskReviewerName(review.user.name),
    verifiedRental: true,
    rentedAt: review.booking.endTime,
  };
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesCacheService: DevicesCacheService,
  ) {}

  /** Khách có được đánh giá thiết bị này không + đánh giá hiện có của họ. */
  async getEligibility(
    userId: string,
    deviceId: string,
  ): Promise<ReviewEligibility> {
    const [user, review, booking] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { isBlacklisted: true },
      }),
      this.prisma.review.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      }),
      this.findCompletedBooking(userId, deviceId),
    ]);
    const reason: IneligibleReason | null = user?.isBlacklisted
      ? 'blacklisted'
      : booking
        ? null
        : 'not_rented';
    return {
      canReview: reason === null,
      reason,
      review: review
        ? {
            id: review.id,
            rating: review.rating,
            comment: review.comment,
            createdAt: review.createdAt,
            editedAt: review.editedAt,
            isHidden: review.isHidden,
            hiddenReason: review.hiddenReason,
          }
        : null,
    };
  }

  async create(userId: string, dto: CreateReviewDto) {
    const comment = sanitizeReviewComment(dto.comment);
    await this.assertNotBlacklisted(userId);

    const device = await this.prisma.device.findUnique({
      where: { id: dto.deviceId },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị');

    const booking = await this.findCompletedBooking(userId, dto.deviceId);
    if (!booking) throw new ForbiddenException(NOT_RENTED_MESSAGE);

    const existing = await this.prisma.review.findUnique({
      where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
    });
    if (existing) {
      throw new ConflictException(
        'Bạn đã đánh giá thiết bị này rồi — hãy sửa đánh giá cũ',
      );
    }

    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: {
            bookingId: booking.id,
            userId,
            deviceId: dto.deviceId,
            rating: dto.rating,
            comment,
          },
        });
        await this.recalculateDeviceRating(tx, dto.deviceId);
        return created;
      });
      await this.devicesCacheService.invalidateAll();
      return review;
    } catch (error) {
      // 2 request gửi cùng lúc lọt qua kiểm tra trên → unique (userId, deviceId) chặn.
      throw translateUniqueConstraintError(error, {
        uq_reviews: 'Bạn đã đánh giá thiết bị này rồi',
        booking_id: 'Bạn đã đánh giá thiết bị này rồi',
      });
    }
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.findOwnReview(userId, reviewId);
    await this.assertNotBlacklisted(userId);
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException('Không có thay đổi nào để lưu');
    }
    const comment =
      dto.comment === undefined
        ? undefined
        : sanitizeReviewComment(dto.comment);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({
        where: { id: review.id },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(comment !== undefined ? { comment } : {}),
          editedAt: new Date(),
        },
      });
      await this.recalculateDeviceRating(tx, review.deviceId);
      return saved;
    });
    await this.devicesCacheService.invalidateAll();
    return updated;
  }

  async remove(userId: string, reviewId: string): Promise<void> {
    const review = await this.findOwnReview(userId, reviewId);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: review.id } });
      await this.recalculateDeviceRating(tx, review.deviceId);
    });
    await this.devicesCacheService.invalidateAll();
  }

  /** Danh sách công khai — chỉ đánh giá đang hiển thị. */
  async findPublic(
    filter: ListReviewsFilter,
  ): Promise<PaginatedResult<PublicReview>> {
    const where: Prisma.ReviewWhereInput = {
      isHidden: false,
      ...(filter.deviceId ? { deviceId: filter.deviceId } : {}),
      ...(filter.rating ? { rating: filter.rating } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: publicInclude,
        orderBy: ORDER_BY[filter.sort ?? 'newest'],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(rows.map(toPublic), total, filter.page, filter.limit);
  }

  async getSummary(deviceId: string): Promise<ReviewSummary> {
    const groups = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { deviceId, isHidden: false },
      _count: { _all: true },
    });
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;
    let sum = 0;
    for (const group of groups) {
      const stars = group.rating as keyof typeof distribution;
      if (!(stars in distribution)) continue;
      distribution[stars] = group._count._all;
      total += group._count._all;
      sum += group.rating * group._count._all;
    }
    return {
      deviceId,
      avgRating: total ? Math.round((sum / total) * 10) / 10 : null,
      reviewCount: total,
      distribution,
    };
  }

  /** Đánh giá tốt (4–5★) mới nhất có nội dung, cho trang chủ. */
  async findFeatured(limit = 6): Promise<FeaturedReview[]> {
    const rows = await this.prisma.review.findMany({
      where: {
        isHidden: false,
        rating: { gte: 4 },
        comment: { not: null },
        device: { isDiscontinued: false },
      },
      include: {
        ...publicInclude,
        device: { select: { id: true, name: true, images: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      ...toPublic(row),
      device: {
        id: row.device.id,
        name: row.device.name,
        image: row.device.images[0] ?? null,
      },
    }));
  }

  /** Quản trị: xem cả đánh giá đã ẩn, kèm tên đầy đủ/email người viết. */
  async findForAdmin(filter: ListAdminReviewsFilter) {
    const search = filter.search?.trim();
    const where: Prisma.ReviewWhereInput = {
      ...(filter.deviceId ? { deviceId: filter.deviceId } : {}),
      ...(filter.rating ? { rating: filter.rating } : {}),
      ...(filter.hidden !== undefined ? { isHidden: filter.hidden } : {}),
      ...(search
        ? {
            OR: [
              { device: { name: { contains: search, mode: 'insensitive' } } },
              { user: { name: { contains: search, mode: 'insensitive' } } },
              { comment: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        include: adminInclude,
        orderBy: ORDER_BY[filter.sort ?? 'newest'],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(rows, total, filter.page, filter.limit);
  }

  /**
   * Ẩn/hiện đánh giá (admin/staff). Không cho sửa nội dung — chỉ quyết định có
   * hiển thị hay không, kèm lý do khi ẩn.
   */
  async setVisibility(
    reviewId: string,
    actorId: string,
    dto: SetReviewVisibilityDto,
  ) {
    const reason = dto.reason?.trim();
    if (dto.hidden && !reason) {
      throw new BadRequestException('Vui lòng nhập lý do ẩn đánh giá');
    }
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.review.update({
        where: { id: reviewId },
        data: dto.hidden
          ? {
              isHidden: true,
              hiddenReason: reason,
              hiddenAt: new Date(),
              hiddenById: actorId,
            }
          : {
              isHidden: false,
              hiddenReason: null,
              hiddenAt: null,
              hiddenById: null,
            },
        include: adminInclude,
      });
      await this.recalculateDeviceRating(tx, review.deviceId);
      return saved;
    });
    await this.devicesCacheService.invalidateAll();
    return updated;
  }

  /**
   * Tính lại avgRating/reviewCount của thiết bị từ các đánh giá ĐANG HIỂN THỊ,
   * trong cùng transaction với thay đổi vừa ghi để 2 bảng không bao giờ lệch nhau.
   */
  private async recalculateDeviceRating(
    tx: Prisma.TransactionClient,
    deviceId: string,
  ): Promise<void> {
    const stats = await tx.review.aggregate({
      where: { deviceId, isHidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await tx.device.update({
      where: { id: deviceId },
      data: {
        avgRating: stats._avg.rating,
        reviewCount: stats._count.rating,
      },
    });
  }

  /** Đơn thuê gần nhất ĐÃ TRẢ máy (completed) của khách với thiết bị. */
  private findCompletedBooking(userId: string, deviceId: string) {
    return this.prisma.booking.findFirst({
      where: { userId, deviceId, status: BookingStatus.completed },
      orderBy: { endTime: 'desc' },
      select: { id: true },
    });
  }

  private async findOwnReview(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');
    if (review.userId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể sửa/xoá đánh giá của mình');
    }
    return review;
  }

  private async assertNotBlacklisted(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBlacklisted: true },
    });
    if (user?.isBlacklisted) {
      throw new ForbiddenException(
        'Tài khoản của bạn đang bị hạn chế nên không thể đánh giá',
      );
    }
  }
}
