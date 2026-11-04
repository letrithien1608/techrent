/** Thư mục Cloudinary của ảnh thiết bị (seed + ảnh admin tải lên). */
export const DEVICE_IMAGE_FOLDER = 'techrent/devices';

/**
 * Suy ra `public_id` từ URL ảnh Cloudinary CỦA CHÍNH project (đúng cloud
 * name) và nằm trong `folderPrefix`. URL khác (link ngoài, cloud khác,
 * thư mục khác) → `null` — không bao giờ xoá nhầm ảnh không thuộc mình.
 * Hàm thuần (không DI) để script chạy tay dùng chung với UploadService.
 */
export function publicIdFromCloudinaryUrl(
  url: string,
  cloudName: string | undefined,
  folderPrefix: string,
): string | null {
  const match =
    /^https:\/\/res\.cloudinary\.com\/([^/]+)\/image\/upload\/(?:[^/]*,[^/]*\/)?(?:v\d+\/)?(.+)\.[a-z0-9]+$/i.exec(
      url,
    );
  if (!cloudName || !match || match[1] !== cloudName) return null;
  const publicId = decodeURIComponent(match[2]);
  return publicId.startsWith(`${folderPrefix}/`) ? publicId : null;
}

export interface DeviceImageCleanupDeps {
  /** Chỉ cần đếm thiết bị còn dùng ảnh — PrismaService lẫn PrismaClient đều hợp. */
  prisma: {
    device: {
      count(args: { where: { images: { has: string } } }): Promise<number>;
    };
  };
  publicIdFromUrl(url: string): string | null;
  deleteImage(publicId: string): Promise<void>;
  warn(message: string): void;
}

/**
 * Xoá trên Cloudinary các ảnh thiết bị KHÔNG còn thiết bị nào dùng. Chỉ đụng
 * ảnh trong `techrent/devices` của project; gọi SAU khi CSDL đã lưu xong. Lỗi
 * (Cloudinary hay đếm CSDL) chỉ ghi log, không ném ra — thao tác chính đã xong.
 * Trả về public_id đã xoá.
 */
export async function deleteDeviceImagesIfUnused(
  deps: DeviceImageCleanupDeps,
  urls: Iterable<string>,
): Promise<string[]> {
  const deleted: string[] = [];
  for (const url of new Set(urls)) {
    const publicId = deps.publicIdFromUrl(url);
    if (!publicId) continue;
    try {
      const stillUsed = await deps.prisma.device.count({
        where: { images: { has: url } },
      });
      if (stillUsed > 0) continue;
      await deps.deleteImage(publicId);
      deleted.push(publicId);
    } catch (error) {
      deps.warn(
        `Không xoá được ảnh thiết bị ${publicId}: ${(error as Error).message}`,
      );
    }
  }
  return deleted;
}
