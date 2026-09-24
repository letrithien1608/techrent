import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../generated/prisma/client';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: {
    $transaction: jest.Mock;
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findMany: jest.Mock };
  };
  let realtimeGateway: { emitNotificationCreated: jest.Mock };

  const userId = 'user-1';
  const baseNotification = {
    id: 'notif-1',
    userId,
    type: 'booking_confirmed',
    message: 'Đơn của bạn đã được xác nhận',
    isRead: false,
    createdAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findMany: jest.fn() },
    };
    realtimeGateway = { emitNotificationCreated: jest.fn() };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      realtimeGateway as any,
    );
  });

  describe('create', () => {
    it('ghi 1 dòng notification VÀ emit realtime tới đúng userId', async () => {
      prisma.notification.create.mockResolvedValue(baseNotification);

      const result = await service.create(
        userId,
        'booking_confirmed',
        'Đơn của bạn đã được xác nhận',
      );

      expect(result).toEqual(baseNotification);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          userId,
          type: 'booking_confirmed',
          message: 'Đơn của bạn đã được xác nhận',
        },
      });
      expect(realtimeGateway.emitNotificationCreated).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({ id: baseNotification.id }),
      );
    });
  });

  describe('createForRoles', () => {
    it('tạo 1 notification cho MỖI user thuộc role được chỉ định', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'staff-1' },
        { id: 'admin-1' },
      ]);
      prisma.notification.create.mockResolvedValue(baseNotification);

      await service.createForRoles(
        [Role.staff, Role.admin],
        'maintenance_reported',
        'Có sự cố mới',
      );

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: [Role.staff, Role.admin] } },
        select: { id: true },
      });
      expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    });

    it('loại trừ đúng excludeUserId khỏi danh sách nhận (VD người vừa tự báo hỏng)', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'admin-2' }]);
      prisma.notification.create.mockResolvedValue(baseNotification);

      await service.createForRoles(
        [Role.staff, Role.admin],
        'maintenance_reported',
        'Có sự cố mới',
        { excludeUserId: 'staff-1' },
      );

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          role: { in: [Role.staff, Role.admin] },
          id: { not: 'staff-1' },
        },
        select: { id: true },
      });
    });
  });

  describe('findAllForUser', () => {
    it('trả về danh sách phân trang, LUÔN lọc đúng userId', async () => {
      prisma.notification.findMany.mockResolvedValue([baseNotification]);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.findAllForUser(userId, {
        page: 1,
        limit: 20,
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
      expect(result.data).toEqual([baseNotification]);
      expect(result.meta.total).toBe(1);
    });

    it('lọc thêm theo isRead khi có truyền vào (VD đếm số chưa đọc)', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.findAllForUser(userId, { page: 1, limit: 1, isRead: false });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, isRead: false } }),
      );
    });
  });

  describe('markAsRead', () => {
    it('ném NotFoundException nếu không tìm thấy thông báo', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);
      await expect(
        service.markAsRead('missing', userId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ném ForbiddenException nếu không phải chủ thông báo', async () => {
      prisma.notification.findUnique.mockResolvedValue(baseNotification);
      await expect(
        service.markAsRead(baseNotification.id, 'other-user'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('đánh dấu đã đọc thành công', async () => {
      prisma.notification.findUnique.mockResolvedValue(baseNotification);
      prisma.notification.update.mockResolvedValue({
        ...baseNotification,
        isRead: true,
      });

      const result = await service.markAsRead(baseNotification.id, userId);

      expect(result.isRead).toBe(true);
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: baseNotification.id },
        data: { isRead: true },
      });
    });

    it('idempotent — đánh dấu lại thông báo ĐÃ đọc từ trước không lỗi, không update lại', async () => {
      prisma.notification.findUnique.mockResolvedValue({
        ...baseNotification,
        isRead: true,
      });

      const result = await service.markAsRead(baseNotification.id, userId);

      expect(result.isRead).toBe(true);
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('cập nhật TẤT CẢ thông báo CHƯA đọc của đúng user, trả về số lượng', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.markAllAsRead(userId);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
      expect(result).toEqual({ count: 3 });
    });
  });
});
