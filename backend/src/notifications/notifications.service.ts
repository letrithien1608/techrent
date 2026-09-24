import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Notification, Role } from '../generated/prisma/client';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListNotificationsFilter {
  page: number;
  limit: number;
  isRead?: boolean;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Tạo 1 thông báo cho ĐÚNG 1 user + đẩy realtime ngay. Đây là hàm cấp thấp
   * nhất — các module nghiệp vụ (Bookings/Payments/Maintenance) gọi hàm này
   * (hoặc `createForRoles` bên dưới) SAU KHI hành động chính đã ghi DB thành
   * công, và PHẢI tự bọc `try/catch` ở nơi gọi (giống pattern TTL job/hoàn
   * cọc ở BookingsService Tuần 6-7) — lỗi tạo thông báo không được làm hỏng
   * luồng nghiệp vụ chính.
   */
  async create(
    userId: string,
    type: string,
    message: string,
  ): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: { userId, type, message },
    });

    this.realtimeGateway.emitNotificationCreated(userId, {
      id: notification.id,
      type: notification.type,
      message: notification.message,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    });

    return notification;
  }

  /**
   * Tạo thông báo cho TẤT CẢ user thuộc 1/nhiều role (VD báo hỏng thiết bị
   * mới → mọi staff/admin) — schema `notifications` gắn 1-1 với `userId`
   * (không có khái niệm "thông báo chung"), nên tạo lặp lại đúng 1 dòng cho
   * mỗi user nhận là cách mô hình hoá đúng với schema hiện có, không phải
   * workaround. Ở quy mô demo (vài staff/admin) chi phí này không đáng kể.
   */
  async createForRoles(
    roles: Role[],
    type: string,
    message: string,
    options: { excludeUserId?: string } = {},
  ): Promise<void> {
    const recipients = await this.prisma.user.findMany({
      where: {
        role: { in: roles },
        ...(options.excludeUserId ? { id: { not: options.excludeUserId } } : {}),
      },
      select: { id: true },
    });
    await Promise.all(
      recipients.map((recipient) => this.create(recipient.id, type, message)),
    );
  }

  async findAllForUser(
    userId: string,
    filter: ListNotificationsFilter,
  ): Promise<PaginatedResult<Notification>> {
    const where = {
      userId,
      ...(filter.isRead !== undefined ? { isRead: filter.isRead } : {}),
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
      data,
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filter.limit)),
      },
    };
  }

  /** Idempotent — đánh dấu đã đọc 1 thông báo ĐÃ đọc từ trước vẫn thành công, không lỗi. */
  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Không tìm thấy thông báo');
    }
    if (notification.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền truy cập thông báo này');
    }
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
}
