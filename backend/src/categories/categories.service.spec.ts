import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Category } from '../generated/prisma/client';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: {
    category: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    device: {
      count: jest.Mock;
    };
  };

  const baseCategory: Category = {
    id: 'cat-1',
    name: 'Laptop',
    description: 'Laptop văn phòng, gaming',
  };

  beforeEach(() => {
    prisma = {
      category: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      device: { count: jest.fn() },
    };
    service = new CategoriesService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('trả về danh sách danh mục sắp xếp theo tên', async () => {
      prisma.category.findMany.mockResolvedValue([baseCategory]);

      const result = await service.findAll();

      expect(prisma.category.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual([baseCategory]);
    });
  });

  describe('findByIdOrThrow', () => {
    it('ném NotFoundException nếu không tìm thấy danh mục', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.findByIdOrThrow('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu danh mục không tồn tại', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.category.update).not.toHaveBeenCalled();
    });

    it('cập nhật danh mục khi tồn tại', async () => {
      prisma.category.findUnique.mockResolvedValue(baseCategory);
      prisma.category.update.mockResolvedValue({
        ...baseCategory,
        name: 'Laptop & PC',
      });

      const result = await service.update(baseCategory.id, {
        name: 'Laptop & PC',
      });

      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: baseCategory.id },
        data: { name: 'Laptop & PC' },
      });
      expect(result.name).toBe('Laptop & PC');
    });
  });

  describe('remove', () => {
    it('ném NotFoundException nếu danh mục không tồn tại', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('ném ConflictException nếu danh mục còn thiết bị, KHÔNG cho xoá', async () => {
      prisma.category.findUnique.mockResolvedValue(baseCategory);
      prisma.device.count.mockResolvedValue(3);

      await expect(service.remove(baseCategory.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('xoá danh mục khi không còn thiết bị nào', async () => {
      prisma.category.findUnique.mockResolvedValue(baseCategory);
      prisma.device.count.mockResolvedValue(0);

      await service.remove(baseCategory.id);

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: baseCategory.id },
      });
    });
  });
});
