import { ConfigService } from '@nestjs/config';

const configMock = jest.fn();
const uploadMock = jest.fn();
const destroyMock = jest.fn();
const privateDownloadUrlMock = jest.fn();

jest.mock('cloudinary', () => ({
  v2: {
    config: (...args: unknown[]) => configMock(...args),
    uploader: {
      upload: (...args: unknown[]) => uploadMock(...args),
      destroy: (...args: unknown[]) => destroyMock(...args),
    },
    utils: {
      private_download_url: (...args: unknown[]) =>
        privateDownloadUrlMock(...args),
    },
  },
}));

// Import sau khi mock 'cloudinary' để UploadService dùng đúng bản mock
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;
  const configValues: Record<string, string> = {
    CLOUDINARY_CLOUD_NAME: 'd7mchans',
    CLOUDINARY_API_KEY: '153491851222337',
    CLOUDINARY_API_SECRET: 'secret',
  };

  beforeEach(() => {
    configMock.mockClear();
    uploadMock.mockReset();
    destroyMock.mockReset();
    privateDownloadUrlMock.mockReset();
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    } as unknown as ConfigService;
    service = new UploadService(configService);
  });

  it('cấu hình Cloudinary SDK với đúng cloud_name/api_key/api_secret từ ConfigService', () => {
    expect(configMock).toHaveBeenCalledWith({
      cloud_name: 'd7mchans',
      api_key: '153491851222337',
      api_secret: 'secret',
    });
  });

  describe('uploadImage', () => {
    it('chuyển buffer thành data URI base64 và trả về secure_url từ Cloudinary', async () => {
      uploadMock.mockImplementation((_source, _options, callback) => {
        callback(null, {
          secure_url: 'https://res.cloudinary.com/d7mchans/image/upload/x.jpg',
        });
      });

      const buffer = Buffer.from('fake-image-bytes');
      const url = await service.uploadImage(buffer, 'image/jpeg');

      expect(url).toBe(
        'https://res.cloudinary.com/d7mchans/image/upload/x.jpg',
      );
      const [source, options] = uploadMock.mock.calls[0];
      expect(source).toBe(
        `data:image/jpeg;base64,${buffer.toString('base64')}`,
      );
      expect(options).toEqual({ folder: 'techrent/devices' });
    });

    it('reject Promise nếu Cloudinary trả lỗi', async () => {
      uploadMock.mockImplementation((_source, _options, callback) => {
        callback(new Error('Cloudinary quota exceeded'), null);
      });

      await expect(
        service.uploadImage(Buffer.from('x'), 'image/png'),
      ).rejects.toThrow('Cloudinary quota exceeded');
    });
  });

  describe('uploadImages', () => {
    it('upload nhiều ảnh song song, trả về mảng URL đúng thứ tự', async () => {
      let callCount = 0;
      uploadMock.mockImplementation((_source, _options, callback) => {
        callCount += 1;
        callback(null, {
          secure_url: `https://res.cloudinary.com/d7mchans/image/upload/${callCount}.jpg`,
        });
      });

      const urls = await service.uploadImages([
        { buffer: Buffer.from('a'), mimetype: 'image/jpeg' },
        { buffer: Buffer.from('b'), mimetype: 'image/png' },
      ]);

      expect(urls).toEqual([
        'https://res.cloudinary.com/d7mchans/image/upload/1.jpg',
        'https://res.cloudinary.com/d7mchans/image/upload/2.jpg',
      ]);
    });
  });

  describe('uploadFromUrl', () => {
    it('gửi thẳng remote URL cho Cloudinary tự tải + host lại (dùng cho seed data)', async () => {
      uploadMock.mockImplementation((_source, _options, callback) => {
        callback(null, {
          secure_url:
            'https://res.cloudinary.com/d7mchans/image/upload/seed.jpg',
        });
      });

      const url = await service.uploadFromUrl(
        'https://picsum.photos/seed/x/800/600',
      );

      expect(url).toBe(
        'https://res.cloudinary.com/d7mchans/image/upload/seed.jpg',
      );
      expect(uploadMock.mock.calls[0][0]).toBe(
        'https://picsum.photos/seed/x/800/600',
      );
    });

    it('truyền kèm public_id + overwrite:true khi gọi với publicId — dùng cho script seed chạy lại nhiều lần không tạo ảnh trùng', async () => {
      uploadMock.mockImplementation((_source, _options, callback) => {
        callback(null, {
          secure_url:
            'https://res.cloudinary.com/d7mchans/image/upload/techrent/devices/macbook-pro-14.jpg',
        });
      });

      await service.uploadFromUrl(
        'https://images.unsplash.com/photo-xyz',
        'macbook-pro-14',
      );

      const [, options] = uploadMock.mock.calls[0];
      expect(options).toEqual({
        folder: 'techrent/devices',
        public_id: 'macbook-pro-14',
        overwrite: true,
      });
    });
  });

  describe('uploadKycImage', () => {
    it('upload với type:private, format cố định jpg, folder riêng techrent/kyc, trả về public_id (KHÔNG trả URL)', async () => {
      uploadMock.mockImplementation((_source, _options, callback) => {
        callback(null, {
          public_id: 'techrent/kyc/kyc-user-1-cccd-front',
          secure_url: 'https://res.cloudinary.com/d7mchans/image/private/xxx.jpg',
        });
      });

      const buffer = Buffer.from('fake-id-card-bytes');
      const publicId = await service.uploadKycImage(
        buffer,
        'image/jpeg',
        'kyc-user-1-cccd-front',
      );

      expect(publicId).toBe('techrent/kyc/kyc-user-1-cccd-front');
      const [source, options] = uploadMock.mock.calls[0];
      expect(source).toBe(`data:image/jpeg;base64,${buffer.toString('base64')}`);
      expect(options).toEqual({
        folder: 'techrent/kyc',
        type: 'private',
        format: 'jpg',
        public_id: 'kyc-user-1-cccd-front',
        overwrite: true,
      });
    });

    it('reject Promise nếu Cloudinary trả lỗi', async () => {
      uploadMock.mockImplementation((_source, _options, callback) => {
        callback(new Error('Cloudinary quota exceeded'), null);
      });

      await expect(
        service.uploadKycImage(Buffer.from('x'), 'image/png', 'kyc-user-1-selfie'),
      ).rejects.toThrow('Cloudinary quota exceeded');
    });
  });

  describe('generateKycImageViewUrl', () => {
    it('gọi private_download_url với type:private, format jpg, expires_at = hiện tại + ttlSeconds (mặc định 300s)', () => {
      privateDownloadUrlMock.mockReturnValue(
        'https://api.cloudinary.com/v1_1/d7mchans/image/download?...',
      );
      const nowSeconds = Math.floor(Date.now() / 1000);

      const url = service.generateKycImageViewUrl('kyc-user-1-cccd-front');

      expect(url).toBe(
        'https://api.cloudinary.com/v1_1/d7mchans/image/download?...',
      );
      const [publicId, format, options] = privateDownloadUrlMock.mock.calls[0];
      expect(publicId).toBe('kyc-user-1-cccd-front');
      expect(format).toBe('jpg');
      expect(options.resource_type).toBe('image');
      expect(options.type).toBe('private');
      // Cho phép sai số nhỏ do thời gian chạy test — không so khớp tuyệt đối.
      expect(options.expires_at).toBeGreaterThanOrEqual(nowSeconds + 299);
      expect(options.expires_at).toBeLessThanOrEqual(nowSeconds + 301);
    });

    it('dùng đúng ttlSeconds tuỳ chỉnh khi truyền vào', () => {
      privateDownloadUrlMock.mockReturnValue('https://example.com/url');
      const nowSeconds = Math.floor(Date.now() / 1000);

      service.generateKycImageViewUrl('kyc-user-1-selfie', 60);

      const [, , options] = privateDownloadUrlMock.mock.calls[0];
      expect(options.expires_at).toBeGreaterThanOrEqual(nowSeconds + 59);
      expect(options.expires_at).toBeLessThanOrEqual(nowSeconds + 61);
    });
  });

  describe('deleteKycImage', () => {
    it('gọi cloudinary.uploader.destroy với type:private', async () => {
      destroyMock.mockResolvedValue({ result: 'ok' });

      await service.deleteKycImage('kyc-user-1-cccd-back');

      expect(destroyMock).toHaveBeenCalledWith('kyc-user-1-cccd-back', {
        type: 'private',
      });
    });
  });
});
