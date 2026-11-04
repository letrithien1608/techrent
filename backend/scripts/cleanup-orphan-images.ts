/**
 * Tìm (và tuỳ chọn xoá) ảnh MỒ CÔI trên Cloudinary — ảnh không còn ai dùng
 * trong 2 thư mục công khai:
 *   techrent/devices/  (ảnh thiết bị)
 *   techrent/avatars/  (ảnh đại diện)
 *
 *   npx ts-node --transpile-only scripts/cleanup-orphan-images.ts          (CHỈ liệt kê — mặc định)
 *   npx ts-node --transpile-only scripts/cleanup-orphan-images.ts --apply  (xoá thật)
 *
 * "Còn dùng" = có trong bất kỳ nguồn nào dưới đây (so theo public_id):
 *   - devices.images (mọi thiết bị, kể cả đã ngừng kinh doanh)
 *   - users.avatar_url / users.avatar_public_id
 *   - metadata.deviceImage của thông báo (ảnh nhỏ trong danh sách thông báo)
 *   - scripts/device-images/manifest.json (seed đọc URL ảnh từ đây)
 * Ảnh tạo trong vòng 24 giờ gần nhất luôn được bỏ qua (có thể đang tải lên dở).
 *
 * CHỈ liệt kê đúng 2 tiền tố trên qua Admin API — ảnh eKYC (techrent/kyc,
 * type private), biên bản giao/trả máy (techrent/inspections), ảnh báo lỗi
 * (techrent/issues) và mọi thư mục khác không bao giờ được đọc hay xoá.
 * Danh sách ghi ra scripts/output/orphan-images.json.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  DEVICE_IMAGE_FOLDER,
  publicIdFromCloudinaryUrl,
} from '../src/upload/cloudinary-url.util';
import { AVATAR_UPLOAD_FOLDER } from '../src/upload/upload.service';
import { readManifest } from './device-images/manifest-store';

const FOLDERS = [DEVICE_IMAGE_FOLDER, AVATAR_UPLOAD_FOLDER] as const;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const OUTPUT_FILE = join(__dirname, 'output', 'orphan-images.json');

interface CloudinaryResource {
  public_id: string;
  bytes: number;
  created_at: string;
  secure_url: string;
}

async function listFolder(folder: string): Promise<CloudinaryResource[]> {
  const resources: CloudinaryResource[] = [];
  let cursor: string | undefined;
  do {
    const page = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'image',
      // Dấu "/" cuối: không khớp nhầm thư mục khác có cùng phần đầu tên.
      prefix: `${folder}/`,
      max_results: 500,
      next_cursor: cursor,
    });
    resources.push(...(page.resources as CloudinaryResource[]));
    cursor = page.next_cursor;
  } while (cursor);
  return resources;
}

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

async function main() {
  const apply = process.argv.includes('--apply');
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  cloudinary.config({
    cloud_name: cloudName,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    // public_id đang được tham chiếu, kèm nguồn tham chiếu để báo cáo.
    const usedBy = new Map<string, Set<string>>();
    const markUsed = (url: string | null | undefined, source: string) => {
      if (!url) return;
      for (const folder of FOLDERS) {
        const publicId = publicIdFromCloudinaryUrl(url, cloudName, folder);
        if (!publicId) continue;
        const sources = usedBy.get(publicId) ?? new Set<string>();
        sources.add(source);
        usedBy.set(publicId, sources);
      }
    };

    const [devices, users, notifications] = await Promise.all([
      prisma.device.findMany({ select: { images: true } }),
      prisma.user.findMany({
        where: {
          OR: [{ avatarUrl: { not: null } }, { avatarPublicId: { not: null } }],
        },
        select: { avatarUrl: true, avatarPublicId: true },
      }),
      prisma.notification.findMany({ select: { metadata: true } }),
    ]);
    for (const device of devices) {
      for (const url of device.images) markUsed(url, 'devices.images');
    }
    for (const user of users) {
      markUsed(user.avatarUrl, 'users.avatar');
      if (user.avatarPublicId) {
        const sources = usedBy.get(user.avatarPublicId) ?? new Set<string>();
        sources.add('users.avatar');
        usedBy.set(user.avatarPublicId, sources);
      }
    }
    for (const notification of notifications) {
      const metadata = notification.metadata as Record<string, unknown> | null;
      const image = metadata?.deviceImage;
      if (typeof image === 'string') markUsed(image, 'notifications');
    }
    // Mọi URL có trong manifest (không chỉ thiết bị "đã upload") — seed đọc từ đây.
    for (const device of Object.values(readManifest().devices)) {
      for (const image of device.images) markUsed(image.url, 'manifest.json');
    }

    const now = Date.now();
    const orphans: CloudinaryResource[] = [];
    const recent: CloudinaryResource[] = [];
    const keptOnlyBy = { notifications: 0, 'manifest.json': 0 };
    let scanned = 0;
    for (const folder of FOLDERS) {
      const resources = await listFolder(folder);
      scanned += resources.length;
      console.log(`📁 ${folder}/: ${resources.length} ảnh`);
      for (const resource of resources) {
        const sources = usedBy.get(resource.public_id);
        if (sources) {
          // Chỉ còn được giữ vì thông báo cũ / manifest → báo riêng để biết.
          if (!sources.has('devices.images') && !sources.has('users.avatar')) {
            if (sources.has('notifications')) keptOnlyBy.notifications++;
            else if (sources.has('manifest.json'))
              keptOnlyBy['manifest.json']++;
          }
          continue;
        }
        if (now - new Date(resource.created_at).getTime() < MIN_AGE_MS) {
          recent.push(resource);
          continue;
        }
        orphans.push(resource);
      }
    }

    const totalBytes = orphans.reduce((sum, r) => sum + r.bytes, 0);
    console.log(`\nĐã quét ${scanned} ảnh.`);
    console.log(
      `Giữ vì chỉ còn thông báo cũ tham chiếu: ${keptOnlyBy.notifications}; chỉ còn manifest.json: ${keptOnlyBy['manifest.json']}`,
    );
    console.log(`Bỏ qua (tạo trong 24 giờ qua): ${recent.length}`);
    console.log(
      `🗑  Ảnh mồ côi: ${orphans.length} ảnh, ${formatMb(totalBytes)}`,
    );
    for (const folder of FOLDERS) {
      const inFolder = orphans.filter((r) =>
        r.public_id.startsWith(`${folder}/`),
      );
      console.log(
        `   ${folder}/: ${inFolder.length} ảnh, ${formatMb(inFolder.reduce((s, r) => s + r.bytes, 0))}`,
      );
    }
    for (const r of orphans) {
      console.log(
        `   - ${r.public_id} (${(r.bytes / 1024).toFixed(0)} KB, ${r.created_at.slice(0, 10)})`,
      );
    }

    mkdirSync(join(__dirname, 'output'), { recursive: true });
    writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: apply ? 'apply' : 'dry-run',
          scanned,
          skippedRecent: recent.map((r) => r.public_id),
          keptOnlyBy,
          orphanCount: orphans.length,
          orphanBytes: totalBytes,
          orphans: orphans.map((r) => ({
            publicId: r.public_id,
            bytes: r.bytes,
            createdAt: r.created_at,
            url: r.secure_url,
          })),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`\n📝 Đã ghi danh sách: ${OUTPUT_FILE}`);

    if (!apply) {
      console.log('(chạy thử — chưa xoá gì; thêm --apply để xoá thật)');
      return;
    }
    let deleted = 0;
    for (let i = 0; i < orphans.length; i += 100) {
      const ids = orphans.slice(i, i + 100).map((r) => r.public_id);
      const result = await cloudinary.api.delete_resources(ids, {
        type: 'upload',
        resource_type: 'image',
      });
      deleted += Object.values(result.deleted as Record<string, string>).filter(
        (status) => status === 'deleted',
      ).length;
    }
    console.log(`✅ Đã xoá ${deleted}/${orphans.length} ảnh trên Cloudinary`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
