import { ConfigService } from '@nestjs/config';

const configMock = jest.fn();
const uploadMock = jest.fn();

jest.mock('cloudinary', () => ({
  v2: {
    config: (...args: unknown[]) => configMock(...args),
    uploader: { upload: (...args: unknown[]) => uploadMock(...args) },
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
  });
});
