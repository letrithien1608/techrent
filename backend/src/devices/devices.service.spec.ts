import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Device, DeviceStatus, Prisma } from '../generated/prisma/client';
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
  };
  let realtimeGateway: { emitDeviceStatusChanged: jest.Mock };
  let uploadService: {
    publicIdFromUrl: jest.Mock;
    deletePublicImage: jest.Mock;
  };
  let devicesCacheService: {
    buildKey: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
    invalidateAll: jest.Mock;
    getOrLoad: jest.Mock;
  };

  const baseDevice: Device = {
    id: 'device-1',
    name: 'MacBook Pro 14" M3',
    categoryId: 'cat-1',
    specs: { cpu: 'Apple M3 Pro' },
    specSheet: null,
    status: DeviceStatus.available,
    pricePerHour: '50000' as unknown as Device['pricePerHour'],
    pricePerDay: '350000' as unknown as Device['pricePerDay'],
    originalPrice: '45000000' as unknown as Device['originalPrice'],
    detailedDescription: null,
    images: [],
    avgRating: null,
    reviewCount: 0,
    isDiscontinued: false,
    discontinuedAt: null,
    serialNumber: 'C02XK1ABJG5H',
    brand: 'Apple',
    accessories: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    // Giả lập đúng quy tắc thật: chỉ URL Cloudinary của project trong techrent/devices mới có public_id.
    uploadService = {
      publicIdFromUrl: jest.fn((url: string) => {
        const m =
          /res\.cloudinary\.com\/demo\/image\/upload\/v1\/(techrent\/devices\/[^.]+)\./.exec(
            url,
          );
        return m ? m[1] : null;
      }),
      deletePublicImage: jest.fn().mockResolvedValue(undefined),
    };
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
    };
    realtimeGateway = { emitDeviceStatusChanged: jest.fn() };
    // Mặc định get() -> null (cache miss) để các test hiện có vẫn đi đúng
    // đường truy vấn DB thật như trước khi có cache — test riêng cho hành vi
    // cache hit/invalidate nằm trong describe('cache') bên dưới.
    devicesCacheService = {
      buildKey: jest.fn(
        (filter: any) => `devices:list:${JSON.stringify(filter)}`,
      ),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      invalidateAll: jest.fn().mockResolvedValue(undefined),
      // Mô phỏng đúng getOrLoad() thật (đọc cache → trượt thì gọi loader → lưu)
      // qua get/set giả ở trên; single-flight được test riêng ở
      // devices-cache.service.spec.ts.
      getOrLoad: jest.fn(
        async (key: string, loader: () => Promise<unknown>) => {
          const cached = await devicesCacheService.get(key);
          if (cached) return cached;
          const value = await loader();
          await devicesCacheService.set(key, value);
          return value;
        },
      ),
    };
    service = new DevicesService(
      prisma as unknown as PrismaService,
      realtimeGateway as any,
      devicesCacheService as any,
      uploadService as any,
    );
  });

  describe('findAll', () => {
    it('trả về danh sách phân trang kèm meta đúng', async () => {
      prisma.device.findMany.mockResolvedValue([baseDevice]);
      prisma.device.count.mockResolvedValue(23);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isDiscontinued: false },
          skip: 10,
          take: 10,
        }),
      );
      expect(result.meta).toEqual({
        page: 2,
        limit: 10,
        total: 23,
        totalPages: 3,
      });
      expect(result.data).toEqual([baseDevice]);
    });

    it('mặc định ẩn thiết bị ngừng kinh doanh; trang admin truyền includeDiscontinued thì thấy đủ', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, includeDiscontinued: true });

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
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
          where: {
            isDiscontinued: false,
            categoryId: 'cat-1',
            status: DeviceStatus.maintenance,
          },
        }),
      );
      expect(prisma.device.count).toHaveBeenCalledWith({
        where: {
          isDiscontinued: false,
          categoryId: 'cat-1',
          status: DeviceStatus.maintenance,
        },
      });
    });

    it('mặc định sắp xếp theo mới nhất khi không truyền sort', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 });

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('sort=price_asc sắp xếp theo giá/ngày tăng dần', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, sort: 'price_asc' });

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { pricePerDay: 'asc' } }),
      );
    });

    it('sort=price_desc sắp xếp theo giá/ngày giảm dần', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, sort: 'price_desc' });

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { pricePerDay: 'desc' } }),
      );
    });

    it('lọc theo tên thiết bị (search) không phân biệt hoa thường', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20, search: 'macbook' });

      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDiscontinued: false,
            name: { contains: 'macbook', mode: 'insensitive' },
          },
        }),
      );
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
          serialNumber: 'SN-TEST-1',
          name: 'X',
          categoryId: 'ghost-cat',
          pricePerHour: 1000,
          pricePerDay: 5000,
          originalPrice: 500000,
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
        serialNumber: 'SN-TEST-1',
        name: 'MacBook Pro 14" M3',
        categoryId: 'cat-1',
        pricePerHour: 50000,
        pricePerDay: 350000,
        originalPrice: 45000000,
      });

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ images: [] }),
      });
    });

    it('lưu specSheet và đồng bộ cột specs cũ theo dạng phẳng', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Laptop',
      });
      prisma.device.create.mockResolvedValue(baseDevice);
      const specSheet = [
        { group: 'Hiệu năng', label: 'CPU', value: 'Apple M3 Pro' },
        { group: 'Màn hình', label: 'Tần số quét', value: '120Hz' },
      ];

      await service.create({
        serialNumber: 'SN-TEST-1',
        name: 'MacBook Pro 14" M3',
        categoryId: 'cat-1',
        pricePerHour: 50000,
        pricePerDay: 350000,
        originalPrice: 45000000,
        specSheet,
      });

      expect(prisma.device.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          specSheet,
          specs: { CPU: 'Apple M3 Pro', 'Tần số quét': '120Hz' },
        }),
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

    it('cập nhật status thiết bị (VD chuyển sang maintenance) và emit realtime', async () => {
      prisma.device.findUnique.mockResolvedValue(baseDevice);
      prisma.device.update.mockResolvedValue({
        ...baseDevice,
        status: DeviceStatus.maintenance,
      });

      const result = await service.update(baseDevice.id, {
        status: DeviceStatus.maintenance,
      });

      expect(result.status).toBe(DeviceStatus.maintenance);
      expect(realtimeGateway.emitDeviceStatusChanged).toHaveBeenCalledWith({
        deviceId: baseDevice.id,
        status: DeviceStatus.maintenance,
      });
    });

    it('KHÔNG emit realtime nếu chỉ sửa tên/giá, không đụng tới status', async () => {
      prisma.device.findUnique.mockResolvedValue(baseDevice);
      prisma.device.update.mockResolvedValue({
        ...baseDevice,
        name: 'Tên mới',
      });

      await service.update(baseDevice.id, { name: 'Tên mới' });

      expect(realtimeGateway.emitDeviceStatusChanged).not.toHaveBeenCalled();
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
      expect(devicesCacheService.invalidateAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache Redis cho GET /devices (mục 9 Roadmap)', () => {
    it('cache HIT: trả thẳng dữ liệu cache, KHÔNG gọi DB', async () => {
      const cached = {
        data: [baseDevice],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      devicesCacheService.get.mockResolvedValue(cached);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result).toBe(cached);
      expect(prisma.device.findMany).not.toHaveBeenCalled();
      expect(prisma.device.count).not.toHaveBeenCalled();
      expect(devicesCacheService.set).not.toHaveBeenCalled();
    });

    it('cache MISS: gọi DB như bình thường rồi lưu lại kết quả vào cache', async () => {
      devicesCacheService.get.mockResolvedValue(null);
      prisma.device.findMany.mockResolvedValue([baseDevice]);
      prisma.device.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(prisma.device.findMany).toHaveBeenCalled();
      expect(devicesCacheService.set).toHaveBeenCalledWith(
        expect.any(String),
        result,
      );
    });

    it('cache key được build từ ĐÚNG filter truyền vào (page/limit/categoryId/status/search/sort)', async () => {
      prisma.device.findMany.mockResolvedValue([]);
      prisma.device.count.mockResolvedValue(0);
      const filter = {
        page: 2,
        limit: 10,
        categoryId: 'cat-1',
        status: DeviceStatus.available,
        search: 'macbook',
        sort: 'price_asc' as const,
      };

      await service.findAll(filter);

      expect(devicesCacheService.buildKey).toHaveBeenCalledWith(filter);
    });

    it('create() xoá cache danh sách sau khi tạo thiết bị mới', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-1',
        name: 'Laptop',
      });
      prisma.device.create.mockResolvedValue(baseDevice);

      await service.create({
        serialNumber: 'SN-TEST-1',
        name: 'X',
        categoryId: 'cat-1',
        pricePerHour: 1000,
        pricePerDay: 5000,
        originalPrice: 500000,
      });

      expect(devicesCacheService.invalidateAll).toHaveBeenCalledTimes(1);
    });

    it('update() xoá cache danh sách dù CHỈ sửa tên (không đụng status)', async () => {
      prisma.device.findUnique.mockResolvedValue(baseDevice);
      prisma.device.update.mockResolvedValue({
        ...baseDevice,
        name: 'Tên mới',
      });

      await service.update(baseDevice.id, { name: 'Tên mới' });

      expect(devicesCacheService.invalidateAll).toHaveBeenCalledTimes(1);
    });

    it('remove() xoá cache danh sách sau khi xoá thiết bị', async () => {
      prisma.device.findUnique.mockResolvedValue(baseDevice);

      await service.remove(baseDevice.id);

      expect(devicesCacheService.invalidateAll).toHaveBeenCalledTimes(1);
    });
  });

  it('serial/IMEI trùng thiết bị khác → 409 tiếng Việt (không lộ lỗi Prisma)', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prisma.device.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.10.0',
        meta: { target: ['serial_number'] },
      }),
    );
    await expect(
      service.create({
        serialNumber: 'C02XK1ABJG5H',
        name: 'MacBook',
        categoryId: 'cat-1',
        pricePerHour: 1,
        pricePerDay: 1,
        originalPrice: 1,
      }),
    ).rejects.toThrow('Số serial/IMEI này đã được dùng cho thiết bị khác');
  });

  it('lưu serial (cắt khoảng trắng), hãng và phụ kiện khi tạo thiết bị', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'cat-1' });
    prisma.device.create.mockResolvedValue(baseDevice);
    await service.create({
      serialNumber: '  C02XK1ABJG5H ',
      brand: 'Apple',
      accessories: [{ name: 'Bộ sạc', quantity: 1 }],
      name: 'MacBook',
      categoryId: 'cat-1',
      pricePerHour: 1,
      pricePerDay: 1,
      originalPrice: 1,
    });
    expect(prisma.device.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serialNumber: 'C02XK1ABJG5H',
        brand: 'Apple',
        accessories: [{ name: 'Bộ sạc', quantity: 1 }],
      }),
    });
  });

  describe('replaceImages — sửa ảnh thiết bị', () => {
    const cdn = (n: string) =>
      `https://res.cloudinary.com/demo/image/upload/v1/techrent/devices/${n}.jpg`;
    const oldImages = ['a', 'b', 'c', 'd', 'e'].map(cdn);

    beforeEach(() => {
      prisma.device.findUnique.mockResolvedValue({
        ...baseDevice,
        images: oldImages,
      });
      prisma.device.update.mockResolvedValue(baseDevice);
      prisma.device.count.mockResolvedValue(0);
    });

    it('đổi thứ tự (đặt ảnh đại diện) → lưu đúng thứ tự, xoá cache, không xoá ảnh nào', async () => {
      const reordered = [oldImages[3], ...oldImages.filter((_, i) => i !== 3)];
      await service.replaceImages('device-1', reordered);

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: 'device-1' },
        data: { images: reordered },
      });
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
      expect(uploadService.deletePublicImage).not.toHaveBeenCalled();
    });

    it('ảnh bị bỏ được xoá trên Cloudinary SAU khi lưu thành công', async () => {
      const next = [...oldImages.slice(1), cdn('moi')];
      await service.replaceImages('device-1', next);

      expect(uploadService.deletePublicImage).toHaveBeenCalledWith(
        'techrent/devices/a',
      );
      const saveOrder = prisma.device.update.mock.invocationCallOrder[0];
      const deleteOrder =
        uploadService.deletePublicImage.mock.invocationCallOrder[0];
      expect(saveOrder).toBeLessThan(deleteOrder);
    });

    it('lưu DB lỗi → KHÔNG xoá ảnh nào', async () => {
      prisma.device.update.mockRejectedValue(new Error('db down'));
      await expect(
        service.replaceImages('device-1', [...oldImages.slice(1), cdn('moi')]),
      ).rejects.toThrow('db down');
      expect(uploadService.deletePublicImage).not.toHaveBeenCalled();
    });

    it('ảnh tải lên trong phiên nhưng bỏ trước khi lưu cũng bị xoá', async () => {
      await service.replaceImages('device-1', oldImages, [cdn('bo-ngang')]);
      expect(uploadService.deletePublicImage).toHaveBeenCalledWith(
        'techrent/devices/bo-ngang',
      );
    });

    it('ảnh còn được thiết bị khác dùng → không xoá', async () => {
      prisma.device.count.mockResolvedValue(1);
      await service.replaceImages('device-1', [
        ...oldImages.slice(1),
        cdn('moi'),
      ]);
      expect(uploadService.deletePublicImage).not.toHaveBeenCalled();
    });

    it('dưới 5 ảnh → 400, không lưu', async () => {
      await expect(
        service.replaceImages('device-1', oldImages.slice(0, 4)),
      ).rejects.toThrow('tối thiểu 5 ảnh');
      expect(prisma.device.update).not.toHaveBeenCalled();
    });

    it('link ngoài / ảnh không thuộc techrent/devices → 400', async () => {
      await expect(
        service.replaceImages('device-1', [
          ...oldImages.slice(1),
          'https://evil.example.com/x.jpg',
        ]),
      ).rejects.toThrow('Ảnh không hợp lệ');
      expect(prisma.device.update).not.toHaveBeenCalled();
    });

    it('trùng ảnh → 400', async () => {
      await expect(
        service.replaceImages('device-1', [...oldImages, oldImages[0]]),
      ).rejects.toThrow('trùng');
    });

    it('lỗi xoá Cloudinary không làm hỏng thao tác lưu', async () => {
      uploadService.deletePublicImage.mockRejectedValue(new Error('cdn'));
      await expect(
        service.replaceImages('device-1', [...oldImages.slice(1), cdn('moi')]),
      ).resolves.toBeDefined();
    });
  });
});
