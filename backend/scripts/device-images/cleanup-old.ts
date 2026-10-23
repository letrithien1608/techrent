/**
 * Xoá ảnh cũ không còn dùng trong thư mục Cloudinary techrent/devices/.
 *   npx ts-node --transpile-only scripts/device-images/cleanup-old.ts          (chỉ liệt kê)
 *   npx ts-node --transpile-only scripts/device-images/cleanup-old.ts --apply  (xoá thật)
 *
 * "Không còn dùng" = không nằm trong Device.images của bất kỳ thiết bị nào (kể cả
 * thiết bị đã ngừng kinh doanh) và không thuộc ảnh đã upload trong manifest.json.
 * Chỉ quét techrent/devices/ — ảnh KYC (techrent/kyc/) không bao giờ bị đụng tới.
 */
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { readManifest, uploadedUrls } from './manifest-store';

const PREFIX = 'techrent/devices/';

/** public_id từ URL Cloudinary: phần sau /upload/(v123/) bỏ đuôi file. */
function publicIdFromUrl(url: string): string | null {
  const match = url.match(/\/upload\/(?:[^/]+\/)*?(?:v\d+\/)(.+)\.[a-z0-9]+$/i);
  return match ? match[1] : null;
}

async function listAll(): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await cloudinary.api.resources({
      type: 'upload',
      prefix: PREFIX,
      max_results: 500,
      next_cursor: cursor,
    });
    ids.push(...page.resources.map((r: { public_id: string }) => r.public_id));
    cursor = page.next_cursor;
  } while (cursor);
  return ids;
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

  const used = new Set<string>();
  const devices = await prisma.device.findMany({ select: { images: true } });
  for (const url of devices.flatMap((d) => d.images)) {
    const id = publicIdFromUrl(url);
    if (id) used.add(id);
  }
  for (const device of Object.values(readManifest().devices)) {
    for (const url of uploadedUrls(device)) {
      const id = publicIdFromUrl(url);
      if (id) used.add(id);
    }
  }

  const all = await listAll();
  const unused = all.filter((id) => !used.has(id));
  console.log(
    `Cloudinary ${PREFIX}: ${all.length} ảnh, đang dùng ${all.length - unused.length}, không dùng ${unused.length}`,
  );
  unused.forEach((id) => console.log(`  - ${id}`));

  if (process.argv.includes('--apply') && unused.length) {
    for (let i = 0; i < unused.length; i += 100) {
      await cloudinary.api.delete_resources(unused.slice(i, i + 100));
    }
    console.log(`Đã xoá ${unused.length} ảnh.`);
  } else if (unused.length) {
    console.log('Chạy lại với --apply để xoá.');
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
