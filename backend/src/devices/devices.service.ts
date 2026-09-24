import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Device, DeviceStatus } from '../generated/prisma/client';
import { DeviceSort } from './dto/list-devices-query.dto';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ListDevicesFilter {
  page: number;
  limit: number;
  categoryId?: string;
  status?: DeviceStatus;
  sort?: DeviceSort;
  search?: string;
}

const deviceWithCategory = {
  include: { category: { select: { id: true, name: true } } },
} satisfies Prisma.DeviceDefaultArgs;

export type DeviceWithCategory = Prisma.DeviceGetPayload<
  typeof deviceWithCategory
>;

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async findAll(
    filter: ListDevicesFilter,
  ): Promise<PaginatedResult<DeviceWithCategory>> {
    const { page, limit, categoryId, status, sort, search } = filter;
    const where: Prisma.DeviceWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(status ? { status } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    const orderBy: Prisma.DeviceOrderByWithRelationInput =
      sort === 'price_asc'
        ? { pricePerDay: 'asc' }
        : sort === 'price_desc'
          ? { pricePerDay: 'desc' }
          : { createdAt: 'desc' };

    const [devices, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
        ...deviceWithCategory,
      }),
      this.prisma.device.count({ where }),
    ]);

    return {
      data: devices,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findByIdOrThrow(id: string): Promise<DeviceWithCategory> {
    const device = await this.prisma.device.findUnique({
      where: { id },
      ...deviceWithCategory,
    });
    if (!device) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }
    return device;
  }

  async create(data: {
    name: string;
    categoryId: string;
    specs?: Record<string, unknown>;
    pricePerHour: number;
    pricePerDay: number;
    images?: string[];
  }): Promise<Device> {
    await this.assertCategoryExists(data.categoryId);

    return this.prisma.device.create({
      data: {
        name: data.name,
        categoryId: data.categoryId,
        specs: data.specs as Prisma.InputJsonValue | undefined,
        pricePerHour: data.pricePerHour,
        pricePerDay: data.pricePerDay,
        images: data.images ?? [],
      },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      categoryId?: string;
      specs?: Record<string, unknown>;
      pricePerHour?: number;
      pricePerDay?: number;
      status?: DeviceStatus;
      images?: string[];
    },
  ): Promise<Device> {
    await this.findByIdOrThrow(id);
    if (data.categoryId) {
      await this.assertCategoryExists(data.categoryId);
    }

    const updated = await this.prisma.device.update({
      where: { id },
      data: {
        ...data,
        specs: data.specs as Prisma.InputJsonValue | undefined,
      },
    });

    // Chỉ emit khi admin THỰC SỰ đổi status qua form này (VD sửa tên/giá thì
    // không cần bắn realtime, tránh spam sự kiện không ảnh hưởng gì tới UI
    // đang lắng nghe badge trạng thái).
    if (data.status !== undefined) {
      this.realtimeGateway.emitDeviceStatusChanged({
        deviceId: id,
        status: updated.status,
      });
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.device.delete({ where: { id } });
  }

  /** Gắn thêm ảnh mới (từ Cloudinary) vào danh sách ảnh hiện có của thiết bị. */
  async addImages(id: string, imageUrls: string[]): Promise<Device> {
    const device = await this.findByIdOrThrow(id);
    return this.prisma.device.update({
      where: { id },
      data: { images: [...device.images, ...imageUrls] },
    });
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
  }
}
