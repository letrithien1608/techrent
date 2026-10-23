import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Category } from '../generated/prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `activeOnly` (trang khách): chỉ danh mục còn ít nhất 1 thiết bị đang kinh
   * doanh — danh mục chỉ còn thiết bị ngừng kinh doanh (giữ lại vì có lịch sử
   * đơn) không hiện ở bộ lọc. Trang admin gọi không kèm cờ để thấy đủ.
   */
  findAll(activeOnly = false): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: activeOnly
        ? { devices: { some: { isDiscontinued: false } } }
        : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findByIdOrThrow(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục');
    }
    return category;
  }

  create(data: { name: string; description?: string }): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  async update(
    id: string,
    data: { name?: string; description?: string },
  ): Promise<Category> {
    await this.findByIdOrThrow(id);
    return this.prisma.category.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.findByIdOrThrow(id);

    const deviceCount = await this.prisma.device.count({
      where: { categoryId: id },
    });
    if (deviceCount > 0) {
      throw new ConflictException(
        `Không thể xoá danh mục đang có ${deviceCount} thiết bị — hãy chuyển/xoá thiết bị trước`,
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }
}
