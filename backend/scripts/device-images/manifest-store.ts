import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Trạng thái ảnh của 1 thiết bị, đi theo đúng thứ tự:
 * chưa làm → đã tải (đã chọn + tải ảnh gốc về work/) → đã kiểm tra (đã mở xem
 * từng ảnh, đúng model) → đã upload (đã lên Cloudinary + cập nhật DB).
 */
export type DeviceImageStatus =
  'chưa làm' | 'đã tải' | 'đã kiểm tra' | 'đã upload';

/** Vai trò ảnh — ảnh `front` (mặt trước, nền sạch) luôn là ảnh bìa. */
export type ImageRole = 'front' | 'back' | 'angle' | 'detail' | 'use';

export interface ManifestImage {
  role: ImageRole;
  /** File ảnh gốc trong scripts/device-images/work/<slug>/ (không commit). */
  file: string;
  /** URL ảnh gốc — tải lại được nếu thư mục work/ bị xoá. */
  source: string;
  /** Trang chứa ảnh (dùng làm Referer khi tải lại và ghi nguồn). */
  page: string;
  /** Ghi công: tác giả/hãng + giấy phép nếu có. */
  credit: string;
  /** URL Cloudinary sau khi upload. */
  url?: string;
}

export interface ManifestDevice {
  name: string;
  status: DeviceImageStatus;
  images: ManifestImage[];
  /** Ghi chú: VD vì sao chưa đủ 5 ảnh đúng model. */
  note?: string;
}

export interface Manifest {
  devices: Record<string, ManifestDevice>;
}

export const IMAGES_DIR = __dirname;
export const WORK_DIR = join(__dirname, 'work');
const MANIFEST_PATH = join(__dirname, 'manifest.json');

export const ROLE_ORDER: ImageRole[] = [
  'front',
  'back',
  'angle',
  'detail',
  'use',
];

export const ROLE_LABEL: Record<ImageRole, string> = {
  front: 'mặt trước',
  back: 'mặt sau/cạnh',
  angle: 'góc nghiêng',
  detail: 'chi tiết cổng/nút',
  use: 'sử dụng thực tế/phụ kiện',
};

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8')) as Manifest;
}

export function writeManifest(manifest: Manifest): void {
  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  );
}

/** Cùng quy tắc với slugify() trong prisma/seed.ts. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Ảnh đã upload, ảnh bìa (front) đứng đầu. */
export function uploadedUrls(device: ManifestDevice | undefined): string[] {
  if (!device || device.status !== 'đã upload') return [];
  return [...device.images]
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map((image) => image.url)
    .filter((url): url is string => !!url);
}
