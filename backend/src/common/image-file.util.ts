import { BadRequestException } from '@nestjs/common';

export type AllowedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export const ALLOWED_IMAGE_TYPES: AllowedImageType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

/**
 * Nhận diện định dạng ảnh bằng "chữ ký" ở đầu file (magic bytes) — KHÔNG tin
 * `mimetype`/đuôi file do trình duyệt gửi lên (đổi tên `.exe` thành `.jpg`
 * vẫn bị phát hiện). Trả `null` nếu không phải JPG/PNG/WEBP.
 */
export function detectImageType(buffer: Buffer): AllowedImageType | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Kiểm tra lại ở backend: chỉ JPG/PNG/WEBP thật (theo nội dung) và không vượt `maxBytes`. */
export function assertAllowedImage(
  file: { buffer: Buffer; size?: number } | undefined,
  maxBytes: number,
): AllowedImageType {
  if (!file || !file.buffer?.length) {
    throw new BadRequestException('Vui lòng chọn 1 ảnh');
  }
  const size = file.size ?? file.buffer.length;
  if (size > maxBytes) {
    throw new BadRequestException(
      `Ảnh vượt quá ${Math.round(maxBytes / 1024 / 1024)}MB, vui lòng chọn ảnh nhỏ hơn`,
    );
  }
  const type = detectImageType(file.buffer);
  if (!type) {
    throw new BadRequestException('Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP');
  }
  return type;
}
