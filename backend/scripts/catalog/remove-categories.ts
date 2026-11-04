/**
 * Gỡ danh mục khỏi hệ thống AN TOÀN cho dữ liệu đang chạy:
 *   npx ts-node scripts/catalog/remove-categories.ts "PC & Mini PC" [--dry-run]
 *
 * - Thiết bị ĐÃ có đơn thuê hoặc phiếu bảo trì → KHÔNG xoá cứng (giữ lịch sử
 *   đơn, hợp đồng, doanh thu), chỉ đánh dấu ngừng kinh doanh (isDiscontinued):
 *   ẩn khỏi trang khách, chặn đặt mới. Đơn đang chờ/đang thuê giữ nguyên.
 * - Thiết bị chưa có đơn nào → xoá hẳn.
 * - Danh mục chỉ bị xoá khi không còn thiết bị nào; còn thiết bị ngừng kinh
 *   doanh thì giữ lại (trang khách tự ẩn qua GET /categories?activeOnly=true).
 * - Cuối cùng xoá cache Redis danh sách thiết bị, rồi xoá trên Cloudinary ảnh
 *   của các thiết bị đã xoá hẳn (cùng logic DevicesService.remove(): chỉ ảnh
 *   trong techrent/devices của project, bỏ qua ảnh thiết bị khác còn dùng,
 *   lỗi chỉ ghi log).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import {
  DEVICE_IMAGE_FOLDER,
  deleteDeviceImagesIfUnused,
  publicIdFromCloudinaryUrl,
} from '../../src/upload/cloudinary-url.util';
import { invalidateDeviceListCache } from './redis-cache';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function deleteImagesOfRemovedDevices(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const deleted = await deleteDeviceImagesIfUnused(
    {
      prisma,
      publicIdFromUrl: (url) =>
        publicIdFromCloudinaryUrl(
          url,
          process.env.CLOUDINARY_CLOUD_NAME,
          DEVICE_IMAGE_FOLDER,
        ),
      deleteImage: async (publicId) => {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      },
      warn: (message) => console.warn(`  ⚠️  ${message}`),
    },
    urls,
  );
  console.log(`🖼  Đã xoá ${deleted.length} ảnh trên Cloudinary`);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const names = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (names.length === 0) {
    throw new Error('Cần truyền tên danh mục, VD: "PC & Mini PC"');
  }

  // Ảnh của thiết bị đã xoá hẳn — chỉ xoá trên Cloudinary sau khi CSDL xong.
  const deletedImages: string[] = [];
  for (const name of names) {
    const category = await prisma.category.findFirst({
      where: { name },
      include: {
        devices: {
          select: {
            id: true,
            name: true,
            images: true,
            _count: { select: { bookings: true, maintenance: true } },
          },
        },
      },
    });
    if (!category) {
      console.log(`⏭  Không có danh mục "${name}" (đã gỡ từ trước?)`);
      continue;
    }
    console.log(`📁 ${name}: ${category.devices.length} thiết bị`);
    let kept = 0;
    for (const device of category.devices) {
      const history = device._count.bookings + device._count.maintenance;
      if (history > 0) {
        kept++;
        console.log(
          `  🔒 Ngừng kinh doanh (có ${device._count.bookings} đơn, ${device._count.maintenance} phiếu bảo trì): ${device.name}`,
        );
        if (!dryRun) {
          await prisma.device.update({
            where: { id: device.id },
            data: { isDiscontinued: true, discontinuedAt: new Date() },
          });
        }
      } else {
        console.log(`  🗑  Xoá (chưa có đơn nào): ${device.name}`);
        if (!dryRun) {
          await prisma.device.delete({ where: { id: device.id } });
          deletedImages.push(...device.images);
        }
      }
    }
    if (kept === 0) {
      console.log(`  🗑  Xoá danh mục "${name}"`);
      if (!dryRun) await prisma.category.delete({ where: { id: category.id } });
    } else {
      console.log(
        `  ⚠️  Giữ danh mục "${name}" vì còn ${kept} thiết bị có lịch sử (đã ẩn khỏi trang khách)`,
      );
    }
  }

  if (!dryRun) {
    const cleared = await invalidateDeviceListCache();
    console.log(`🧹 Đã xoá ${cleared} cache danh sách thiết bị`);
    await deleteImagesOfRemovedDevices(deletedImages);
  } else {
    console.log('(chạy thử --dry-run, chưa ghi gì)');
  }
}

main()
  .catch((error) => {
    console.error('❌', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
