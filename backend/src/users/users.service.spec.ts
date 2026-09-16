import { NotFoundException } from '@nestjs/common';
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
        expect.objectContaining({ skip: 20, take: 20 }),
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
  });

  describe('update', () => {
    it('ném NotFoundException nếu user không tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { name: 'B' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('cập nhật user khi tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      prisma.user.update.mockResolvedValue({ ...baseUser, role: Role.staff });

      const result = await service.update(baseUser.id, { role: Role.staff });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: baseUser.id },
        data: { role: Role.staff },
      });
      expect(result.role).toBe(Role.staff);
    });
  });

  describe('remove', () => {
    it('ném NotFoundException nếu user không tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.delete).not.toHaveBeenCalled();
    });

    it('xoá user khi tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await service.remove(baseUser.id);

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: baseUser.id },
      });
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
