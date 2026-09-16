import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

const UPLOAD_FOLDER = 'techrent/devices';

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
   */
  async uploadFromUrl(remoteUrl: string): Promise<string> {
    const result = await this.uploadDataUri(remoteUrl);
    return result.secure_url;
  }

  private uploadDataUri(source: string): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        source,
        { folder: UPLOAD_FOLDER },
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
}
