import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma, Review } from '../generated/prisma/client';
import { CreateReviewDto } from './dto/create-review.dto';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListReviewsFilter {
  page: number;
  limit: number;
  deviceId?: string;
}

// Review là dữ liệu công khai (@Public()) — lộ kèm tên khách hàng (KHÔNG
// email/thông tin nhạy cảm khác) để hiển thị trên trang chi tiết thiết bị,
// giống Amazon/Airbnb hiển thị tên người đánh giá trên review công khai.
const reviewWithReviewer = {
  include: {
    booking: { select: { user: { select: { name: true } } } },
  },
} satisfies Prisma.ReviewDefaultArgs;

export type ReviewWithReviewer = Prisma.ReviewGetPayload<
  typeof reviewWithReviewer
>;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Khách hàng đánh giá booking của chính mình, chỉ khi đã `completed` (mục Tuần 7 Roadmap). */
  async create(userId: string, dto: CreateReviewDto): Promise<Review> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
    });
    if (!booking) {
      throw new NotFoundException('Không tìm thấy booking');
    }
    if (booking.userId !== userId) {
      throw new ForbiddenException(
        'Bạn chỉ có thể đánh giá booking của chính mình',
      );
    }
    if (booking.status !== BookingStatus.completed) {
      throw new BadRequestException(
        `Chỉ có thể đánh giá booking đã "completed" (hiện tại: "${booking.status}")`,
      );
    }

    const existing = await this.prisma.review.findUnique({
      where: { bookingId: dto.bookingId },
    });
    if (existing) {
      throw new ConflictException('Booking này đã được đánh giá rồi');
    }

    return this.prisma.review.create({
      data: {
        bookingId: dto.bookingId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });
  }

  async findAll(
    filter: ListReviewsFilter,
  ): Promise<PaginatedResult<ReviewWithReviewer>> {
    const where = filter.deviceId
      ? { booking: { deviceId: filter.deviceId } }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        ...reviewWithReviewer,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filter.limit)),
      },
    };
  }
}
