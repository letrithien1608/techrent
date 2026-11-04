import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UploadService } from '../upload/upload.service';
import { MIN_DEVICE_IMAGES } from './dto/create-device.dto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Device, DeviceStatus } from '../generated/prisma/client';
import { DevicesCacheService } from './devices-cache.service';
import { translateUniqueConstraintError } from '../common/prisma-error.util';

/** Phụ kiện giao kèm (cột JSON `accessories`). */
export interface DeviceAccessory {
  name: string;
  quantity: number;
}
import { DeviceSort } from './dto/list-devices-query.dto';
import { flattenSpecSheet, type SpecSheetEntry } from './spec-sheet.util';

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
  includeDiscontinued?: boolean;
}

const deviceWithCategory = {
  include: { category: { select: { id: true, name: true } } },
} satisfies Prisma.DeviceDefaultArgs;

export type DeviceWithCategory = Prisma.DeviceGetPayload<
  typeof deviceWithCategory
>;

/** Thư mục Cloudinary của ảnh thiết bị (seed + ảnh admin tải lên). */
const DEVICE_IMAGE_FOLDER = 'techrent/devices';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly devicesCacheService: DevicesCacheService,
    private readonly uploadService: UploadService,
  ) {}

  async findAll(
    filter: ListDevicesFilter,
  ): Promise<PaginatedResult<DeviceWithCategory>> {
    return this.devicesCacheService.getOrLoad(
      this.devicesCacheService.buildKey(filter),
      () => this.queryList(filter),
    );
  }

  private async queryList(
    filter: ListDevicesFilter,
  ): Promise<PaginatedResult<DeviceWithCategory>> {
    const {
      page,
      limit,
      categoryId,
      status,
      sort,
      search,
      includeDiscontinued,
    } = filter;
    const where: Prisma.DeviceWhereInput = {
      ...(includeDiscontinued ? {} : { isDiscontinued: false }),
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

    // Không bọc `$transaction`: chỉ đọc, lệch 1 bản ghi giữa `data` và `total`
    // khi có thiết bị vừa được thêm/xoá là chấp nhận được, trong khi transaction
    // giữ 1 kết nối suốt 2 truy vấn và có hạn chờ 2 s (nguồn lỗi 500 khi tải cao).
    const [devices, total] = await Promise.all([
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
    specSheet?: SpecSheetEntry[];
    detailedDescription?: string;
    pricePerHour: number;
    pricePerDay: number;
    originalPrice: number;
    images?: string[];
    serialNumber: string;
    brand?: string;
    accessories?: DeviceAccessory[];
  }): Promise<Device> {
    await this.assertCategoryExists(data.categoryId);

    const created = await this.withSerialConflict(() =>
      this.prisma.device.create({
        data: {
          name: data.name,
          categoryId: data.categoryId,
          serialNumber: data.serialNumber.trim(),
          brand: data.brand?.trim() || null,
          accessories: (data.accessories ??
            []) as unknown as Prisma.InputJsonValue,
          ...specColumns(data),
          detailedDescription: data.detailedDescription,
          pricePerHour: data.pricePerHour,
          pricePerDay: data.pricePerDay,
          originalPrice: data.originalPrice,
          images: data.images ?? [],
        },
      }),
    );
    await this.devicesCacheService.invalidateAll();
    return created;
  }

  async update(
    id: string,
    data: {
      name?: string;
      categoryId?: string;
      specs?: Record<string, unknown>;
      specSheet?: SpecSheetEntry[];
      detailedDescription?: string;
      pricePerHour?: number;
      pricePerDay?: number;
      originalPrice?: number;
      status?: DeviceStatus;
      images?: string[];
      serialNumber?: string;
      brand?: string;
      accessories?: DeviceAccessory[];
    },
  ): Promise<Device> {
    await this.findByIdOrThrow(id);
    if (data.categoryId) {
      await this.assertCategoryExists(data.categoryId);
    }

    const { accessories, serialNumber, ...rest } = data;
    const updated = await this.withSerialConflict(() =>
      this.prisma.device.update({
        where: { id },
        data: {
          ...withoutSpecs(rest),
          ...specColumns(rest),
          ...(serialNumber !== undefined
            ? { serialNumber: serialNumber.trim() }
            : {}),
          ...(accessories !== undefined
            ? { accessories: accessories as unknown as Prisma.InputJsonValue }
            : {}),
        },
      }),
    );

    // Bất kỳ field nào sửa ở đây đều có thể hiện trên danh sách (tên/giá/
    // status/ảnh đại diện) — invalidate cache toàn bộ danh sách, đơn giản
    // và an toàn hơn cố tính xem field nào THỰC SỰ ảnh hưởng hiển thị.
    await this.devicesCacheService.invalidateAll();

    // Emit realtime CHỈ khi admin THỰC SỰ đổi status qua form này (VD sửa
    // tên/giá thì không cần bắn realtime, tránh spam sự kiện không ảnh hưởng
    // gì tới UI đang lắng nghe badge trạng thái) — khác với cache (invalidate
    // ở TRÊN cho mọi field), vì WebSocket chỉ có 1 việc: báo đổi STATUS.
    if (data.status !== undefined) {
      this.realtimeGateway.emitDeviceStatusChanged({
        deviceId: id,
        status: updated.status,
      });
    }

    return updated;
  }

  /** Serial trùng thiết bị khác (unique ở DB) → 409 tiếng Việt thay vì 500. */
  private async withSerialConflict<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw translateUniqueConstraintError(error, {
        serial_number: 'Số serial/IMEI này đã được dùng cho thiết bị khác',
      });
    }
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.device.delete({ where: { id } });
    await this.devicesCacheService.invalidateAll();
  }

  /** Gắn thêm ảnh mới (từ Cloudinary) vào danh sách ảnh hiện có của thiết bị. */
  /**
   * Lưu bộ ảnh đã sắp xếp (ảnh đầu = ảnh đại diện). Chỉ nhận ảnh đã có của
   * thiết bị hoặc ảnh Cloudinary trong `techrent/devices` (không nhận link
   * ngoài). Lưu DB + xoá cache XONG mới xoá trên Cloudinary các ảnh bị bỏ (và
   * ảnh tải lên trong phiên nhưng bỏ trước khi lưu), trừ ảnh thiết bị khác
   * còn dùng. Lỗi xoá Cloudinary chỉ log, không làm hỏng thao tác lưu.
   */
  async replaceImages(
    id: string,
    images: string[],
    discardedUploads: string[] = [],
  ): Promise<DeviceWithCategory> {
    const device = await this.findByIdOrThrow(id);
    if (new Set(images).size !== images.length) {
      throw new BadRequestException('Danh sách ảnh bị trùng');
    }
    if (images.length < MIN_DEVICE_IMAGES) {
      throw new BadRequestException(
        `Thiết bị cần tối thiểu ${MIN_DEVICE_IMAGES} ảnh`,
      );
    }
    for (const url of images) {
      if (
        !device.images.includes(url) &&
        !this.uploadService.publicIdFromUrl(url, DEVICE_IMAGE_FOLDER)
      ) {
        throw new BadRequestException(
          'Ảnh không hợp lệ — hãy tải ảnh lên qua form quản trị',
        );
      }
    }

    await this.prisma.device.update({ where: { id }, data: { images } });
    await this.devicesCacheService.invalidateAll();

    const removed = new Set(
      [...device.images, ...discardedUploads].filter(
        (url) => !images.includes(url),
      ),
    );
    for (const url of removed) {
      await this.deleteDeviceImageIfUnused(url);
    }
    return this.findByIdOrThrow(id);
  }

  private async deleteDeviceImageIfUnused(url: string): Promise<void> {
    const publicId = this.uploadService.publicIdFromUrl(
      url,
      DEVICE_IMAGE_FOLDER,
    );
    if (!publicId) return;
    const stillUsed = await this.prisma.device.count({
      where: { images: { has: url } },
    });
    if (stillUsed > 0) return;
    try {
      await this.uploadService.deletePublicImage(publicId);
    } catch {
      this.logger.warn(`Không xoá được ảnh thiết bị cũ ${publicId}`);
    }
  }

  async addImages(id: string, imageUrls: string[]): Promise<Device> {
    const device = await this.findByIdOrThrow(id);
    const updated = await this.prisma.device.update({
      where: { id },
      data: { images: [...device.images, ...imageUrls] },
    });
    await this.devicesCacheService.invalidateAll();
    return updated;
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

function withoutSpecs<T extends { specs?: unknown; specSheet?: unknown }>(
  data: T,
): Omit<T, 'specs' | 'specSheet'> {
  const rest = { ...data };
  delete rest.specs;
  delete rest.specSheet;
  return rest;
}

/**
 * Gửi `specSheet` (bảng có cấu trúc) thì cột `specs` cũ được đồng bộ theo, để
 * nơi nào còn đọc dạng cũ cũng thấy đúng số liệu mới.
 */
function specColumns(data: {
  specs?: Record<string, unknown>;
  specSheet?: SpecSheetEntry[];
}): { specs?: Prisma.InputJsonValue; specSheet?: Prisma.InputJsonValue } {
  if (data.specSheet) {
    return {
      specSheet: data.specSheet as unknown as Prisma.InputJsonValue,
      specs: flattenSpecSheet(data.specSheet),
    };
  }
  return { specs: data.specs as Prisma.InputJsonValue | undefined };
}
