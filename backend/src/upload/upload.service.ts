import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

const UPLOAD_FOLDER = 'techrent/devices';
// Thư mục RIÊNG cho ảnh KYC (CCCD mặt trước/sau + ảnh chân dung xác thực) —
// tách khỏi `techrent/devices` (ảnh công khai) để không bao giờ lẫn lộn giữa
// 2 mức độ nhạy cảm khác nhau, dù về mặt kỹ thuật `type: 'private'` đã đủ để
// Cloudinary từ chối truy cập trực tiếp bất kể nằm folder nào.
const KYC_UPLOAD_FOLDER = 'techrent/kyc';
// Chuẩn hoá MỌI ảnh KYC về cùng 1 format khi upload (bất kể định dạng gốc
// người dùng chọn) — để `generateKycImageViewUrl()` luôn biết đúng `format`
// cần truyền cho `private_download_url()` mà KHÔNG cần lưu thêm cột riêng.
const KYC_IMAGE_FORMAT = 'jpg';

@Injectable()
export class UploadService {
  constructor(configService: ConfigService) {
    cloudinary.config({
      cloud_name: configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /** Upload 1 ảnh (buffer từ Multer memory storage) lên Cloudinary, trả về secure URL. */
  async uploadImage(buffer: Buffer, mimetype: string): Promise<string> {
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
    const result = await this.uploadDataUri(dataUri);
    return result.secure_url;
  }

  /** Upload nhiều ảnh cùng lúc, trả về mảng secure URL theo đúng thứ tự. */
  async uploadImages(
    files: { buffer: Buffer; mimetype: string }[],
  ): Promise<string[]> {
    const uploads = files.map((file) =>
      this.uploadImage(file.buffer, file.mimetype),
    );
    return Promise.all(uploads);
  }

  /**
   * Upload từ một URL từ xa (Cloudinary tự tải ảnh về rồi host lại) — dùng cho
   * script seed data, không cần có file buffer thật trên máy.
   *
   * `publicId` (tuỳ chọn) đặt cố định tên file trên Cloudinary (kèm
   * `overwrite: true`) — dùng khi script seed cần CHẠY LẠI ĐƯỢC NHIỀU LẦN mà
   * không tạo ra ảnh trùng lặp mỗi lần chạy (không truyền thì Cloudinary tự
   * sinh tên ngẫu nhiên như trước, đúng hành vi cũ cho mọi lời gọi khác).
   */
  async uploadFromUrl(remoteUrl: string, publicId?: string): Promise<string> {
    const result = await this.uploadDataUri(remoteUrl, publicId);
    return result.secure_url;
  }

  private uploadDataUri(
    source: string,
    publicId?: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        source,
        {
          folder: UPLOAD_FOLDER,
          ...(publicId ? { public_id: publicId, overwrite: true } : {}),
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Upload Cloudinary thất bại'));
            return;
          }
          resolve(result);
        },
      );
    });
  }

  /**
   * Upload ảnh KYC (CCCD mặt trước/sau, ảnh chân dung xác thực) — `type:
   * 'private'`, Cloudinary CDN từ chối truy cập trực tiếp bất kỳ URL nào tới
   * ảnh này (đã verify THẬT bằng curl trước khi code — xem CLAUDE.md), KHÁC
   * HOÀN TOÀN `uploadImage()`/`uploadFromUrl()` (ảnh thiết bị, công khai).
   * Trả về `public_id` (KHÔNG trả URL) — URL CHỈ sinh tại thời điểm cần hiển
   * thị qua `generateKycImageViewUrl()`, KHÔNG BAO GIỜ lưu URL cố định vào DB.
   */
  async uploadKycImage(
    buffer: Buffer,
    mimetype: string,
    publicId: string,
  ): Promise<string> {
    const dataUri = `data:${mimetype};base64,${buffer.toString('base64')}`;
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader.upload(
        dataUri,
        {
          folder: KYC_UPLOAD_FOLDER,
          type: 'private',
          format: KYC_IMAGE_FORMAT,
          public_id: publicId,
          overwrite: true,
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Upload Cloudinary thất bại'));
            return;
          }
          resolve(result);
        },
      );
    });
    return result.public_id;
  }

  /**
   * Sinh URL xem 1 ảnh KYC, HẾT HẠN SAU `ttlSeconds` (mặc định 5 phút) —
   * dùng `cloudinary.utils.private_download_url()` với `expires_at`. ĐÃ
   * VERIFY THẬT (không chỉ tin tài liệu): gọi URL này SAU khi `expires_at`
   * trôi qua trả về `401` kèm `{"error":{"message":"Stale request - expires_at
   * ... has passed"}}` — Cloudinary THẬT SỰ kiểm tra hạn ở tầng API, không
   * cần cấu hình thêm gì trên dashboard (khác hẳn `sign_url:true` thường —
   * dùng cho ảnh thiết bị công khai — vốn KHÔNG có hạn thật). Response trả
   * trực tiếp bytes ảnh (`Content-Type: image/...`, `Content-Disposition:
   * inline`) — dùng được thẳng làm `<img src>`, không phải redirect.
   */
  generateKycImageViewUrl(publicId: string, ttlSeconds = 300): string {
    return cloudinary.utils.private_download_url(publicId, KYC_IMAGE_FORMAT, {
      resource_type: 'image',
      type: 'private',
      expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    });
  }

  /**
   * Xoá vĩnh viễn 1 ảnh KYC khỏi Cloudinary — dùng khi admin RESET hồ sơ xác
   * thực (ảnh mờ/sai/hết hạn, cho khách nộp lại) — không để ảnh cũ nằm lại
   * trên storage vô thời hạn sau khi đã "reset" ở DB.
   */
  async deleteKycImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { type: 'private' });
  }
}
