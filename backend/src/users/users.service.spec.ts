import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '../generated/prisma/client';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const baseUser: User = {
    id: 'user-1',
    name: 'Nguyễn Văn A',
    email: 'user@example.com',
    passwordHash: 'hashed',
    refreshTokenHash: null,
    role: Role.customer,
    phone: null,
    cccdEncrypted: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('findByIdOrThrow', () => {
    it('ném NotFoundException nếu không tìm thấy user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.findByIdOrThrow('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('trả về user nếu tìm thấy', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(service.findByIdOrThrow(baseUser.id)).resolves.toEqual(
        baseUser,
      );
    });
  });

  describe('findAll', () => {
    it('trả về danh sách đã sanitize kèm meta phân trang đúng', async () => {
      prisma.user.findMany.mockResolvedValue([baseUser]);
      prisma.user.count.mockResolvedValue(45);

      const result = await service.findAll(2, 20);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20, where: {} }),
      );
      expect(result.data).toEqual([service.sanitize(baseUser)]);
      expect(result.data[0]).not.toHaveProperty('passwordHash');
      expect(result.meta).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      });
    });

    it('lọc theo role khi có truyền vào', async () => {
      prisma.user.findMany.mockResolvedValue([baseUser]);
      prisma.user.count.mockResolvedValue(1);

      await service.findAll(1, 20, Role.admin);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: Role.admin } }),
      );
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: Role.admin },
      });
    });

    it('tìm theo tên hoặc email khi có search', async () => {
      prisma.user.findMany.mockResolvedValue([baseUser]);
      prisma.user.count.mockResolvedValue(1);

      await service.findAll(1, 20, undefined, 'nguyen');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { name: { contains: 'nguyen', mode: 'insensitive' } },
              { email: { contains: 'nguyen', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });
  });

  describe('update', () => {
    // Người gọi không trùng với user đang sửa (VD admin sửa user khác) —
    // dùng id khác `baseUser.id` để không vô tình trigger chặn tự-sửa-mình.
    const otherCallerId = 'caller-other-1';

    it('ném NotFoundException nếu user không tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { name: 'B' }, otherCallerId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('cập nhật user khi tồn tại (người gọi khác user đang sửa)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.user.update.mockResolvedValue({ ...baseUser, role: Role.staff });

      const result = await service.update(
        baseUser.id,
        { role: Role.staff },
        otherCallerId,
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { role: Role.staff },
      });
      expect(result.role).toBe(Role.staff);
    });

    it('chặn tự đổi role của chính mình (id trùng currentUserId, role khác role hiện tại)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(
        service.update(baseUser.id, { role: Role.admin }, baseUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('KHÔNG chặn nếu tự sửa chính mình nhưng không đổi role (chỉ đổi tên/phone)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.user.update.mockResolvedValue({ ...baseUser, name: 'B' });

      await expect(
        service.update(baseUser.id, { name: 'B' }, baseUser.id),
      ).resolves.toEqual({ ...baseUser, name: 'B' });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { name: 'B' },
      });
    });

    it('KHÔNG chặn nếu role gửi lên trùng với role hiện tại (không thực sự đổi gì)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.user.update.mockResolvedValue(baseUser);

      await expect(
        service.update(baseUser.id, { role: baseUser.role }, baseUser.id),
      ).resolves.toEqual(baseUser);
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    const otherCallerId = 'caller-other-1';

    it('ném NotFoundException nếu user không tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('missing-id', otherCallerId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('xoá user khi tồn tại (người gọi khác user bị xoá)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await service.remove(baseUser.id, otherCallerId);

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: baseUser.id },
      });
    });

    it('chặn tự xoá chính tài khoản đang gọi request', async () => {
      await expect(
        service.remove(baseUser.id, baseUser.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.delete).not.toHaveBeenCalled();
      // Chặn ngay từ đầu, không cần tốn 1 lần query kiểm tra tồn tại nữa.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('sanitize', () => {
    it('loại bỏ passwordHash và refreshTokenHash khỏi kết quả trả về', () => {
      const result = service.sanitize({
        ...baseUser,
        passwordHash: 'secret-hash',
        refreshTokenHash: 'secret-refresh-hash',
      });

      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('refreshTokenHash');
      expect(result).toEqual({
        id: baseUser.id,
        name: baseUser.name,
        email: baseUser.email,
        role: baseUser.role,
        phone: baseUser.phone,
        emailVerifiedAt: baseUser.emailVerifiedAt,
        createdAt: baseUser.createdAt,
      });
    });
  });
});
