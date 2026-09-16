import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Device, DeviceStatus } from '../generated/prisma/client';

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
}

const deviceWithCategory = {
  include: { category: { select: { id: true, name: true } } },
} satisfies Prisma.DeviceDefaultArgs;

export type DeviceWithCategory = Prisma.DeviceGetPayload<
  typeof deviceWithCategory
>;

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    filter: ListDevicesFilter,
  ): Promise<PaginatedResult<DeviceWithCategory>> {
    const { page, limit, categoryId, status } = filter;
    const where: Prisma.DeviceWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(status ? { status } : {}),
    };

    const [devices, total] = await this.prisma.$transaction([
      this.prisma.device.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
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

    return this.prisma.device.update({
      where: { id },
      data: {
        ...data,
        specs: data.specs as Prisma.InputJsonValue | undefined,
      },
    });
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
