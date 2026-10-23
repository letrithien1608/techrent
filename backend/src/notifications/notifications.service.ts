import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BookingStatus, Notification, Role } from '../generated/prisma/client';
import type { NotificationContent } from './notification-templates';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListNotificationsFilter {
  page: number;
  limit: number;
  isRead?: boolean;
  /** Lọc theo loại (VD ['booking_pending', 'booking_paid']). */
  types?: string[];
}

/**
 * Trạng thái THẬT hiện tại của đơn thuê mà thông báo nhắc tới — để giao diện
 * không hiện nút "Xác nhận/Từ chối" cho đơn đã được admin khác xử lý, và hiện
 * "Đã xác nhận bởi ..." thay vì nội dung cũ lúc tạo thông báo.
 */
export interface NotificationBookingState {
  status: BookingStatus;
  confirmedByName: string | null;
  cancelledByName: string | null;
  cancellationReason: string | null;
}

export type NotificationWithBookingState = Notification & {
  bookingState: NotificationBookingState | null;
};

function bookingIdOf(notification: Notification): string | null {
  const metadata = notification.metadata;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const id = (metadata as Record<string, unknown>).bookingId;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Tạo 1 thông báo cho ĐÚNG 1 user + đẩy realtime ngay. Nội dung dựng sẵn
   * bằng notification-templates.ts. Nơi gọi PHẢI tự bọc try/catch — lỗi tạo
   * thông báo không được làm hỏng luồng nghiệp vụ chính.
   */
  async create(
    userId: string,
    content: NotificationContent,
  ): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: content.type,
        title: content.title,
        message: content.message,
        link: content.link,
        metadata: content.metadata,
      },
    });

    this.realtimeGateway.emitNotificationCreated(userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      link: notification.link,
      metadata: notification.metadata,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    });

    return notification;
  }

  /**
   * Tạo thông báo cho TẤT CẢ user thuộc 1/nhiều role (schema gắn 1-1 với
   * userId nên tạo 1 dòng cho mỗi người nhận).
   */
  async createForRoles(
    roles: Role[],
    content: NotificationContent,
    options: { excludeUserId?: string } = {},
  ): Promise<void> {
    const recipients = await this.prisma.user.findMany({
      where: {
        role: { in: roles },
        ...(options.excludeUserId
          ? { id: { not: options.excludeUserId } }
          : {}),
      },
      select: { id: true },
    });
    await Promise.all(
      recipients.map((recipient) => this.create(recipient.id, content)),
    );
  }

  async findAllForUser(
    userId: string,
    filter: ListNotificationsFilter,
  ): Promise<PaginatedResult<NotificationWithBookingState>> {
    const where = {
      userId,
      ...(filter.isRead !== undefined ? { isRead: filter.isRead } : {}),
      ...(filter.types?.length ? { type: { in: filter.types } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: await this.attachBookingStates(data),
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filter.limit)),
      },
    };
  }

  /** 2 truy vấn gộp (đơn + tên người xử lý) cho cả trang — không N+1. */
  private async attachBookingStates(
    notifications: Notification[],
  ): Promise<NotificationWithBookingState[]> {
    const bookingIds = [
      ...new Set(
        notifications.map(bookingIdOf).filter((id): id is string => !!id),
      ),
    ];
    if (bookingIds.length === 0) {
      return notifications.map((n) => ({ ...n, bookingState: null }));
    }

    const bookings = await this.prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      select: {
        id: true,
        status: true,
        confirmedById: true,
        cancelledById: true,
        cancellationReason: true,
      },
    });
    const handlerIds = [
      ...new Set(
        bookings
          .flatMap((b) => [b.confirmedById, b.cancelledById])
          .filter((id): id is string => !!id),
      ),
    ];
    const handlers = handlerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: handlerIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = (id: string | null) =>
      id ? (handlers.find((h) => h.id === id)?.name ?? null) : null;
    const states = new Map(
      bookings.map((b) => [
        b.id,
        {
          status: b.status,
          confirmedByName: nameOf(b.confirmedById),
          cancelledByName: nameOf(b.cancelledById),
          cancellationReason: b.cancellationReason,
        },
      ]),
    );

    return notifications.map((n) => {
      const bookingId = bookingIdOf(n);
      return {
        ...n,
        bookingState: (bookingId && states.get(bookingId)) || null,
      };
    });
  }

  private async findOwnedOrThrow(
    id: string,
    userId: string,
  ): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập thông báo này');
    }
    return notification;
  }

  /** Idempotent — đánh dấu đã đọc 1 thông báo ĐÃ đọc từ trước vẫn thành công, không lỗi. */
  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.findOwnedOrThrow(id, userId);
    if (notification.isRead) {
      return notification;
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { count };
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOwnedOrThrow(id, userId);
    await this.prisma.notification.delete({ where: { id } });
  }
}
