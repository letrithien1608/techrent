import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesCacheService } from '../devices/devices-cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildReviewDeletedNotification } from '../notifications/notification-templates';
import { BookingStatus, Prisma, Role } from '../generated/prisma/client';
import { translateUniqueConstraintError } from '../common/prisma-error.util';
import { REVIEW_EDITS_PER_DAY, storeDayKey } from '../common/business-policy';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { SetReviewVisibilityDto } from './dto/set-review-visibility.dto';
import type {
  AdminReviewStatus,
  ReviewSort,
} from './dto/list-reviews-query.dto';
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
  /** Chỉ đánh giá của người đã thuê (cần deviceId). */
  rentedOnly?: boolean;
}

export interface ListAdminReviewsFilter extends ListReviewsFilter {
  /** Không truyền = mọi đánh giá chưa bị xoá. */
  status?: AdminReviewStatus;
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
  /** Ảnh đại diện CÔNG KHAI của người đánh giá (null = hiện chữ cái đầu). */
  reviewerAvatarUrl: string | null;
  /** Người viết có đơn completed với thiết bị — tính từ dữ liệu đơn, không lưu. */
  verifiedRental: boolean;
  /** Ngày kết thúc đơn thuê completed gần nhất (null nếu chưa thuê). */
  rentedAt: Date | null;
}

export interface FeaturedReview extends PublicReview {
  device: { id: string; name: string; image: string | null };
}

export interface ReviewSummary {
  deviceId: string;
  avgRating: number | null;
  reviewCount: number;
  /** Số đánh giá đang hiển thị của người đã thuê thiết bị. */
  rentedCount: number;
  /** Số đánh giá theo từng mức sao 1..5 (chỉ đánh giá đang hiển thị). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 *   staff               — nhân viên/quản trị không tự chấm điểm thiết bị
 *   blacklisted         — tài khoản trong danh sách đen
 *   removed_by_moderator — đánh giá trước đã bị quản trị xoá → không viết lại
 */
export type IneligibleReason = 'staff' | 'blacklisted' | 'removed_by_moderator';

export interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  editedAt: Date | null;
  isHidden: boolean;
  hiddenReason: string | null;
  /** Có giá trị = đã bị quản trị xoá (chỉ chủ đánh giá thấy). */
  deletedAt: Date | null;
  deleteReason: string | null;
  verifiedRental: boolean;
  /** Số lần còn được sửa trong hôm nay. */
  editsLeftToday: number;
}

export interface MyReviewState {
  /** Được viết đánh giá MỚI (chưa có đánh giá nào cho thiết bị). */
  canCreate: boolean;
  /** Được sửa/xoá đánh giá hiện có. */
  canEdit: boolean;
  reason: IneligibleReason | null;
  review: MyReview | null;
}

const publicInclude = {
  user: { select: { name: true, avatarUrl: true } },
} satisfies Prisma.ReviewInclude;

type ReviewWithAuthor = Prisma.ReviewGetPayload<{
  include: typeof publicInclude;
}>;

const adminInclude = {
  user: { select: { id: true, name: true, email: true } },
  device: { select: { id: true, name: true, images: true } },
} satisfies Prisma.ReviewInclude;

type AdminReviewRow = Prisma.ReviewGetPayload<{
  include: typeof adminInclude;
}>;

const ORDER_BY: Record<
  Exclude<ReviewSort, 'relevant'>,
  Prisma.ReviewOrderByWithRelationInput[]
> = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  highest: [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
};

/** Đánh giá được tính điểm + hiện công khai. */
const VISIBLE: Prisma.ReviewWhereInput = { isHidden: false, deletedAt: null };

const DUPLICATE_MESSAGE =
  'Bạn đã đánh giá thiết bị này rồi — hãy sửa đánh giá của bạn';

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

function pairKey(userId: string, deviceId: string): string {
  return `${userId}:${deviceId}`;
}

/** Điều kiện "người viết có đơn completed với đúng thiết bị này". */
function rentedWhere(
  deviceId: string,
  rented: boolean,
): Prisma.ReviewWhereInput {
  const condition = { deviceId, status: BookingStatus.completed };
  return {
    user: { bookings: rented ? { some: condition } : { none: condition } },
  };
}

function removedMessage(reason: string | null): string {
  return (
    'Đánh giá trước của bạn cho thiết bị này đã bị quản trị viên xoá' +
    (reason ? ` (lý do: ${reason})` : '') +
    ' nên bạn không thể đánh giá lại'
  );
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesCacheService: DevicesCacheService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Trạng thái đánh giá của người đang đăng nhập với 1 thiết bị. */
  async getMine(userId: string, deviceId: string): Promise<MyReviewState> {
    const [user, review, rentals] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { isBlacklisted: true, role: true },
      }),
      this.prisma.review.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      }),
      this.findRentals([{ userId, deviceId }]),
    ]);
    const reason: IneligibleReason | null =
      user && user.role !== Role.customer
        ? 'staff'
        : user?.isBlacklisted
          ? 'blacklisted'
          : review?.deletedAt
            ? 'removed_by_moderator'
            : null;
    const today = storeDayKey(new Date());
    return {
      canCreate: reason === null && !review,
      canEdit: reason === null && !!review,
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
            deletedAt: review.deletedAt,
            deleteReason: review.deleteReason,
            verifiedRental: rentals.has(pairKey(userId, deviceId)),
            editsLeftToday: Math.max(
              0,
              REVIEW_EDITS_PER_DAY -
                (review.editDay === today ? review.editCount : 0),
            ),
          }
        : null,
    };
  }

  async create(userId: string, deviceId: string, dto: CreateReviewDto) {
    const comment = sanitizeReviewComment(dto.comment);
    await this.assertCanWrite(userId);

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true },
    });
    if (!device) throw new NotFoundException('Không tìm thấy thiết bị');

    const existing = await this.prisma.review.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
      select: { deletedAt: true, deleteReason: true },
    });
    if (existing?.deletedAt) {
      throw new ForbiddenException(removedMessage(existing.deleteReason));
    }
    if (existing) throw new ConflictException(DUPLICATE_MESSAGE);

    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.review.create({
          data: { userId, deviceId, rating: dto.rating, comment },
        });
        await this.recalculateDeviceRating(tx, deviceId);
        return created;
      });
      await this.devicesCacheService.invalidateAll();
      return review;
    } catch (error) {
      // 2 request gửi cùng lúc lọt qua kiểm tra trên → unique (userId, deviceId) chặn.
      throw translateUniqueConstraintError(error, {
        uq_reviews: DUPLICATE_MESSAGE,
        user_id: DUPLICATE_MESSAGE,
      });
    }
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.findOwnActiveReview(userId, reviewId);
    await this.assertCanWrite(userId);
    if (dto.rating === undefined && dto.comment === undefined) {
      throw new BadRequestException('Không có thay đổi nào để lưu');
    }
    const comment =
      dto.comment === undefined
        ? undefined
        : sanitizeReviewComment(dto.comment);
    const changes = {
      ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
      ...(comment !== undefined ? { comment } : {}),
      editedAt: new Date(),
    };
    const today = storeDayKey(new Date());

    const updated = await this.prisma.$transaction(async (tx) => {
      // Đếm lượt sửa bằng UPDATE có điều kiện (không đọc-rồi-ghi) để 2 lần sửa
      // đồng thời không vượt giới hạn: cùng ngày → +1 khi còn lượt; ngày mới → 1.
      let result = await tx.review.updateMany({
        where: {
          id: review.id,
          deletedAt: null,
          editDay: today,
          editCount: { lt: REVIEW_EDITS_PER_DAY },
        },
        data: { ...changes, editCount: { increment: 1 } },
      });
      if (result.count === 0) {
        result = await tx.review.updateMany({
          where: {
            id: review.id,
            deletedAt: null,
            OR: [{ editDay: null }, { editDay: { not: today } }],
          },
          data: { ...changes, editDay: today, editCount: 1 },
        });
      }
      if (result.count === 0) {
        throw new HttpException(
          `Mỗi đánh giá chỉ được sửa tối đa ${REVIEW_EDITS_PER_DAY} lần/ngày — vui lòng thử lại vào ngày mai`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.recalculateDeviceRating(tx, review.deviceId);
      return tx.review.findUniqueOrThrow({ where: { id: review.id } });
    });
    await this.devicesCacheService.invalidateAll();
    return updated;
  }

  /** Khách tự xoá đánh giá của mình → xoá hẳn, sau đó được viết lại. */
  async remove(userId: string, reviewId: string): Promise<void> {
    const review = await this.findOwnActiveReview(userId, reviewId);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: review.id } });
      await this.recalculateDeviceRating(tx, review.deviceId);
    });
    await this.devicesCacheService.invalidateAll();
  }

  /**
   * Staff/admin xoá đánh giá vi phạm: xoá MỀM (giữ để đối chiếu khiếu nại) —
   * hàng còn nên unique (user, device) tiếp tục chặn người viết đánh giá lại.
   */
  async moderatorDelete(reviewId: string, actorId: string, rawReason: string) {
    const reason = rawReason?.trim();
    if (!reason) {
      throw new BadRequestException('Vui lòng nhập lý do xoá đánh giá');
    }
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { device: { select: { id: true, name: true, images: true } } },
    });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');
    if (review.deletedAt) {
      throw new ConflictException('Đánh giá này đã bị xoá trước đó');
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const result = await tx.review.update({
        where: { id: reviewId },
        data: {
          deletedAt: new Date(),
          deletedById: actorId,
          deleteReason: reason,
        },
        include: adminInclude,
      });
      await this.recalculateDeviceRating(tx, review.deviceId);
      return result;
    });
    await this.devicesCacheService.invalidateAll();

    try {
      await this.notificationsService.create(
        review.userId,
        buildReviewDeletedNotification({
          reviewId,
          device: review.device,
          reason,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Không gửi được thông báo xoá đánh giá ${reviewId}: ${(error as Error).message}`,
      );
    }
    return (await this.decorateAdminRows([saved]))[0];
  }

  /** Admin khôi phục đánh giá bị xoá nhầm. */
  async restore(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');
    if (!review.deletedAt) {
      throw new BadRequestException('Đánh giá này chưa bị xoá');
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      const result = await tx.review.update({
        where: { id: reviewId },
        data: { deletedAt: null, deletedById: null, deleteReason: null },
        include: adminInclude,
      });
      await this.recalculateDeviceRating(tx, review.deviceId);
      return result;
    });
    await this.devicesCacheService.invalidateAll();
    return (await this.decorateAdminRows([saved]))[0];
  }

  /**
   * Danh sách công khai — chỉ đánh giá đang hiển thị. Sắp xếp mặc định
   * ("relevant") đưa đánh giá của người đã thuê lên trước, trong mỗi nhóm mới
   * nhất trước.
   */
  async findPublic(
    filter: ListReviewsFilter,
  ): Promise<PaginatedResult<PublicReview>> {
    const deviceId = filter.deviceId;
    const base: Prisma.ReviewWhereInput = {
      ...VISIBLE,
      ...(deviceId ? { deviceId } : {}),
      ...(filter.rating ? { rating: filter.rating } : {}),
    };
    const sort = filter.sort ?? 'relevant';
    const skip = (filter.page - 1) * filter.limit;

    let rows: ReviewWithAuthor[];
    let total: number;
    if (deviceId && filter.rentedOnly) {
      const where = { ...base, ...rentedWhere(deviceId, true) };
      [rows, total] = await Promise.all([
        this.prisma.review.findMany({
          where,
          include: publicInclude,
          orderBy: ORDER_BY[sort === 'relevant' ? 'newest' : sort],
          skip,
          take: filter.limit,
        }),
        this.prisma.review.count({ where }),
      ]);
    } else if (deviceId && sort === 'relevant') {
      ({ rows, total } = await this.findRentedFirst(
        base,
        deviceId,
        skip,
        filter.limit,
      ));
    } else {
      [rows, total] = await Promise.all([
        this.prisma.review.findMany({
          where: base,
          include: publicInclude,
          orderBy: ORDER_BY[sort === 'relevant' ? 'newest' : sort],
          skip,
          take: filter.limit,
        }),
        this.prisma.review.count({ where: base }),
      ]);
    }
    return paginate(
      await this.toPublic(rows),
      total,
      filter.page,
      filter.limit,
    );
  }

  async getSummary(deviceId: string): Promise<ReviewSummary> {
    const where = { ...VISIBLE, deviceId };
    const [groups, rentedCount] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
      this.prisma.review.count({
        where: { ...where, ...rentedWhere(deviceId, true) },
      }),
    ]);
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
      rentedCount,
      distribution,
    };
  }

  /** Đánh giá tốt (4–5★) mới nhất có nội dung, cho trang chủ. */
  async findFeatured(limit = 6): Promise<FeaturedReview[]> {
    const rows = await this.prisma.review.findMany({
      where: {
        ...VISIBLE,
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
    const reviews = await this.toPublic(rows);
    return rows.map((row, index) => ({
      ...reviews[index],
      device: {
        id: row.device.id,
        name: row.device.name,
        image: row.device.images[0] ?? null,
      },
    }));
  }

  /** Quản trị: xem cả đánh giá đã ẩn/đã xoá, kèm tên đầy đủ/email người viết. */
  async findForAdmin(filter: ListAdminReviewsFilter) {
    const search = filter.search?.trim();
    const statusWhere: Prisma.ReviewWhereInput =
      filter.status === 'deleted'
        ? { deletedAt: { not: null } }
        : filter.status === 'hidden'
          ? { deletedAt: null, isHidden: true }
          : filter.status === 'visible'
            ? VISIBLE
            : { deletedAt: null };
    const where: Prisma.ReviewWhereInput = {
      ...statusWhere,
      ...(filter.deviceId ? { deviceId: filter.deviceId } : {}),
      ...(filter.rating ? { rating: filter.rating } : {}),
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
    const sort = filter.sort ?? 'newest';
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: adminInclude,
        orderBy:
          filter.status === 'deleted'
            ? [{ deletedAt: 'desc' }]
            : ORDER_BY[sort === 'relevant' ? 'newest' : sort],
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(
      await this.decorateAdminRows(rows),
      total,
      filter.page,
      filter.limit,
    );
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
    if (review.deletedAt) {
      throw new BadRequestException('Đánh giá đã bị xoá — hãy khôi phục trước');
    }

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
    return (await this.decorateAdminRows([updated]))[0];
  }

  /** Phân trang qua 2 nhóm: người đã thuê trước, rồi tới người chưa thuê. */
  private async findRentedFirst(
    base: Prisma.ReviewWhereInput,
    deviceId: string,
    skip: number,
    take: number,
  ): Promise<{ rows: ReviewWithAuthor[]; total: number }> {
    const rentedFilter = { ...base, ...rentedWhere(deviceId, true) };
    const otherFilter = { ...base, ...rentedWhere(deviceId, false) };
    const [rentedTotal, otherTotal] = await Promise.all([
      this.prisma.review.count({ where: rentedFilter }),
      this.prisma.review.count({ where: otherFilter }),
    ]);
    const rented =
      skip < rentedTotal
        ? await this.prisma.review.findMany({
            where: rentedFilter,
            include: publicInclude,
            orderBy: ORDER_BY.newest,
            skip,
            take,
          })
        : [];
    const remaining = take - rented.length;
    const others =
      remaining > 0
        ? await this.prisma.review.findMany({
            where: otherFilter,
            include: publicInclude,
            orderBy: ORDER_BY.newest,
            skip: Math.max(0, skip - rentedTotal),
            take: remaining,
          })
        : [];
    return { rows: [...rented, ...others], total: rentedTotal + otherTotal };
  }

  /**
   * Đơn completed mới nhất theo từng cặp (khách, thiết bị) — 1 truy vấn gộp,
   * dùng để gắn nhãn "Đã thuê thiết bị này".
   */
  private async findRentals(
    pairs: { userId: string; deviceId: string }[],
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (pairs.length === 0) return result;
    const groups = await this.prisma.booking.groupBy({
      by: ['userId', 'deviceId'],
      where: { status: BookingStatus.completed, OR: pairs },
      _max: { endTime: true },
    });
    for (const group of groups) {
      if (group._max.endTime) {
        result.set(pairKey(group.userId, group.deviceId), group._max.endTime);
      }
    }
    return result;
  }

  private async toPublic(rows: ReviewWithAuthor[]): Promise<PublicReview[]> {
    const rentals = await this.findRentals(
      rows.map(({ userId, deviceId }) => ({ userId, deviceId })),
    );
    return rows.map((review) => {
      const rentedAt = rentals.get(pairKey(review.userId, review.deviceId));
      return {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        editedAt: review.editedAt,
        reviewerName: maskReviewerName(review.user.name),
        reviewerAvatarUrl: review.user.avatarUrl,
        verifiedRental: !!rentedAt,
        rentedAt: rentedAt ?? null,
      };
    });
  }

  /** Thêm nhãn đã thuê + tên người xoá cho danh sách quản trị. */
  private async decorateAdminRows(rows: AdminReviewRow[]) {
    const deleterIds = [
      ...new Set(rows.map((row) => row.deletedById).filter((id) => !!id)),
    ] as string[];
    const [rentals, deleters] = await Promise.all([
      this.findRentals(
        rows.map(({ userId, deviceId }) => ({ userId, deviceId })),
      ),
      deleterIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: deleterIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const deleterName = new Map(deleters.map((user) => [user.id, user.name]));
    return rows.map((row) => ({
      ...row,
      verifiedRental: rentals.has(pairKey(row.userId, row.deviceId)),
      deletedBy: row.deletedById
        ? {
            id: row.deletedById,
            name: deleterName.get(row.deletedById) ?? null,
          }
        : null,
    }));
  }

  /**
   * Tính lại avgRating/reviewCount của thiết bị từ các đánh giá ĐANG HIỂN THỊ
   * (chưa ẩn, chưa xoá), trong cùng transaction với thay đổi vừa ghi để 2 bảng
   * không bao giờ lệch nhau.
   */
  private async recalculateDeviceRating(
    tx: Prisma.TransactionClient,
    deviceId: string,
  ): Promise<void> {
    const stats = await tx.review.aggregate({
      where: { ...VISIBLE, deviceId },
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

  /** Đánh giá của chính người gọi, chưa bị quản trị xoá. */
  private async findOwnActiveReview(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Không tìm thấy đánh giá');
    if (review.userId !== userId) {
      throw new ForbiddenException('Bạn chỉ có thể sửa/xoá đánh giá của mình');
    }
    if (review.deletedAt) {
      throw new ForbiddenException(
        'Đánh giá này đã bị quản trị viên xoá nên không thể sửa hoặc xoá',
      );
    }
    return review;
  }

  /** Chỉ khách hàng (không nằm trong danh sách đen) được viết/sửa đánh giá. */
  private async assertCanWrite(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBlacklisted: true, role: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    if (user.role !== Role.customer) {
      throw new ForbiddenException(
        'Nhân viên và quản trị viên không thể đánh giá thiết bị',
      );
    }
    if (user.isBlacklisted) {
      throw new ForbiddenException(
        'Tài khoản của bạn đang bị hạn chế nên không thể đánh giá',
      );
    }
  }
}
