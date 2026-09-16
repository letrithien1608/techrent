import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Device, DeviceStatus } from '../generated/prisma/client';
import { DevicesService } from './devices.service';

describe('DevicesService', () => {
  let service: DevicesService;
  let prisma: {
    device: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    category: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  const baseDevice: Device = {
    id: 'device-1',
    name: 'MacBook Pro 14" M3',
    categoryId: 'cat-1',
    specs: { cpu: 'Apple M3 Pro' },
    status: DeviceStatus.available,
    pricePerHour: '50000' as unknown as Device['pricePerHour'],
    pricePerDay: '350000' as unknown as Device['pricePerDay'],
    images: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      device: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      category: { findUnique: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new DevicesService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('trả về danh sách phân trang kèm meta đúng', async () => {
      prisma.device.findMany.mockResolvedValue([baseDevice]);
      prisma.device.count.mockResolvedValue(23);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {}, skip: 10, take: 10 }),
      );
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 23,
        totalPages: 3,
      });
      expect(result.data).toEqual([baseDevice]);
    });

    it('lọc theo categoryId và status khi có truyền vào', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);

      await service.findAll({
        page: 1,
        limit: 20,
        categoryId: 'cat-1',
        status: DeviceStatus.maintenance,
      });

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { categoryId: 'cat-1', status: DeviceStatus.maintenance },
        }),
      );
      expect(prisma.device.count).toHaveBeenCalledWith({
        where: { categoryId: 'cat-1', status: DeviceStatus.maintenance },
      });
    });
  });

  describe('findByIdOrThrow', () => {
    it('ném NotFoundException nếu không tìm thấy thiết bị', async () => {
      prisma.device.findUnique.mockResolvedValue(null);

      await expect(service.findByIdOrThrow('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('ném NotFoundException nếu categoryId không tồn tại', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'X',
          categoryId: 'ghost-cat',
          pricePerHour: 1000,
          pricePerDay: 5000,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.device.create).not.toHaveBeenCalled();
    });

    it('tạo thiết bị mới khi category hợp lệ, mặc định images = []', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Laptop',
      });
      prisma.device.create.mockResolvedValue(baseDevice);

      await service.create({
        name: 'MacBook Pro 14" M3',
        categoryId: 'cat-1',
        pricePerHour: 50000,
        pricePerDay: 350000,
      });

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ images: [] }),
      });
    });
  });

  describe('update', () => {
    it('ném NotFoundException nếu thiết bị không tồn tại', async () => {
      prisma.device.findUnique.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ném NotFoundException nếu đổi sang categoryId không tồn tại', async () => {
      prisma.device.findUnique.mockResolvedValue(baseDevice);
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.update(baseDevice.id, { categoryId: 'ghost-cat' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.device.update).not.toHaveBeenCalled();
    });

    it('cập nhật status thiết bị (VD chuyển sang maintenance)', async () => {
      prisma.device.findUnique.mockResolvedValue(baseDevice);
      prisma.device.update.mockResolvedValue({
        ...baseDevice,
        status: DeviceStatus.maintenance,
      });

      const result = await service.update(baseDevice.id, {
        status: DeviceStatus.maintenance,
      });

      expect(result.status).toBe(DeviceStatus.maintenance);
    });
  });

  describe('remove', () => {
    it('ném NotFoundException nếu thiết bị không tồn tại', async () => {
      prisma.device.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('xoá thiết bị khi tồn tại', async () => {
      prisma.device.findUnique.mockResolvedValue(baseDevice);

      await service.remove(baseDevice.id);

      expect(prisma.device.delete).toHaveBeenCalledWith({
        where: { id: baseDevice.id },
      });
    });
  });

  describe('addImages', () => {
    it('nối thêm URL ảnh mới vào mảng images hiện có (không ghi đè)', async () => {
      prisma.device.findUnique.mockResolvedValue({
        ...baseDevice,
        images: ['https://res.cloudinary.com/x/old.jpg'],
      });
      prisma.device.update.mockImplementation((args: any) =>
        Promise.resolve({ ...baseDevice, images: args.data.images }),
      );

      const result = await service.addImages(baseDevice.id, [
        'https://res.cloudinary.com/x/new1.jpg',
        'https://res.cloudinary.com/x/new2.jpg',
      ]);

      expect(result.images).toEqual([
        'https://res.cloudinary.com/x/old.jpg',
        'https://res.cloudinary.com/x/new1.jpg',
        'https://res.cloudinary.com/x/new2.jpg',
      ]);
    });
  });
});
