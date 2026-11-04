"use server";

import { updateTag } from "next/cache";

/**
 * Sau khi admin lưu ảnh/thông tin thiết bị: xoá cache dữ liệu thiết bị của
 * Next.js (fetch gắn tag "devices", revalidate 60 s) để trang chủ và trang chi
 * tiết hiện ảnh mới ngay. Chỉ làm mới cache — không đọc/ghi dữ liệu nào.
 */
export async function revalidateDevices(): Promise<void> {
  updateTag("devices");
}
