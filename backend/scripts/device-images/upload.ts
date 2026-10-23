/**
 * Upload ảnh thiết bị đã kiểm tra lên Cloudinary rồi cập nhật DB, theo từng đợt.
 *   npx ts-node --transpile-only scripts/device-images/upload.ts [--batch 10] [--slug <slug>]
 *
 * Chỉ xử lý thiết bị trạng thái "đã kiểm tra" trong manifest.json. Mỗi ảnh được
 * chuẩn hoá (xoay theo EXIF, cạnh dài ≤ 1600px, JPEG nén) rồi lưu ở
 * techrent/devices/<slug>/<số thứ tự>-<vai trò>. Chạy lại an toàn: thiết bị đã
 * "đã upload" bị bỏ qua, ảnh trùng public_id được ghi đè.
 */
import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
// sharp xuất kiểu CommonJS (export =) — dạng import mặc định không gọi được khi chạy bằng ts-node.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import sharp = require('sharp');
import { v2 as cloudinary } from 'cloudinary';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { invalidateDeviceListCache } from '../catalog/redis-cache';
import {
  readManifest,
  ROLE_ORDER,
  uploadedUrls,
  WORK_DIR,
  writeManifest,
  type ManifestImage,
} from './manifest-store';

const MAX_SIDE = 1600;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
}

async function loadOriginal(
  slug: string,
  image: ManifestImage,
): Promise<Buffer> {
  const local = join(WORK_DIR, slug, image.file);
  if (existsSync(local)) return readFileSync(local);
  const res = await fetch(image.source, {
    headers: {
      Referer: image.page,
      'User-Agent': 'Mozilla/5.0 TechRentStudentProject/1.0',
    },
  });
  if (!res.ok) throw new Error(`Tải lại ${image.source} lỗi ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  mkdirSync(join(WORK_DIR, slug), { recursive: true });
  writeFileSync(local, buffer);
  return buffer;
}

async function normalize(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

function uploadBuffer(buffer: Buffer, publicId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          public_id: publicId,
          overwrite: true,
          resource_type: 'image',
          format: 'jpg',
        },
        (error, result) =>
          error || !result ? reject(error) : resolve(result.secure_url),
      )
      .end(buffer);
  });
}

async function main() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const batch = Number(arg('--batch') ?? 10);
  const only = arg('--slug');
  const manifest = readManifest();

  const queue = Object.entries(manifest.devices)
    .filter(
      ([slug, device]) =>
        device.status === 'đã kiểm tra' && (!only || slug === only),
    )
    .slice(0, batch);
  if (queue.length === 0) {
    console.log('Không có thiết bị nào ở trạng thái "đã kiểm tra".');
  }

  for (const [slug, device] of queue) {
    const images = [...device.images].sort(
      (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
    );
    for (const [index, image] of images.entries()) {
      const publicId = `techrent/devices/${slug}/${index + 1}-${image.role}`;
      image.url = await uploadBuffer(
        await normalize(await loadOriginal(slug, image)),
        publicId,
      );
    }
    device.status = 'đã upload';
    writeManifest(manifest);

    const row = await prisma.device.findFirst({ where: { name: device.name } });
    if (row) {
      await prisma.device.update({
        where: { id: row.id },
        data: { images: uploadedUrls(device) },
      });
      console.log(`✅ ${device.name}: ${images.length} ảnh`);
    } else {
      console.log(
        `⚠️  ${device.name}: đã upload nhưng không thấy trong DB (sẽ áp dụng khi seed)`,
      );
    }
  }

  const cleared = await invalidateDeviceListCache();
  console.log(`Đã xoá ${cleared} key cache danh sách thiết bị.`);
  const left = Object.values(manifest.devices).filter(
    (d) => d.status !== 'đã upload',
  ).length;
  console.log(`Còn ${left} thiết bị chưa upload.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
