const uploadMock = jest.fn();
const destroyMock = jest.fn();

jest.mock('cloudinary', () => ({
  v2: {
    config: () => ({ cloud_name: 'demo' }),
    uploader: {
      upload: (...args: unknown[]) => uploadMock(...args),
      destroy: (...args: unknown[]) => destroyMock(...args),
    },
  },
}));

import { UploadService } from './upload.service';

describe('UploadService — ảnh công khai (avatar, ảnh thiết bị)', () => {
  const service = new UploadService({ get: () => 'x' } as any);

  beforeEach(() => {
    uploadMock.mockReset();
    destroyMock.mockReset();
  });

  it('uploadAvatar: thư mục techrent/avatars, resize 256x256, KHÔNG type private', async () => {
    uploadMock.mockImplementation((_src, _opts, cb) =>
      cb(null, {
        public_id: 'techrent/avatars/user-1-x',
        secure_url:
          'https://res.cloudinary.com/demo/image/upload/v1/techrent/avatars/user-1-x.jpg',
      }),
    );
    const result = await service.uploadAvatar(
      { buffer: Buffer.from('abc'), mimetype: 'image/png' },
      'user-1-x',
    );

    const [source, opts] = uploadMock.mock.calls[0];
    expect(source).toMatch(/^data:image\/png;base64,/);
    expect(opts).toMatchObject({
      folder: 'techrent/avatars',
      public_id: 'user-1-x',
      transformation: [
        expect.objectContaining({ width: 256, height: 256, crop: 'fill' }),
      ],
    });
    expect(opts.type).toBeUndefined();
    expect(result.publicId).toBe('techrent/avatars/user-1-x');
  });

  it('uploadAvatar từ ảnh Google/Facebook: đưa URL cho Cloudinary tự tải về', async () => {
    uploadMock.mockImplementation((_src, _opts, cb) =>
      cb(null, { public_id: 'p', secure_url: 'u' }),
    );
    await service.uploadAvatar(
      { remoteUrl: 'https://lh3.googleusercontent.com/a/abc' },
      'user-2',
    );
    expect(uploadMock.mock.calls[0][0]).toBe(
      'https://lh3.googleusercontent.com/a/abc',
    );
  });

  it('deletePublicImage xoá ảnh công khai (không phải private)', async () => {
    destroyMock.mockResolvedValue({ result: 'ok' });
    await service.deletePublicImage('techrent/avatars/a');
    expect(destroyMock).toHaveBeenCalledWith('techrent/avatars/a', {
      resource_type: 'image',
    });
  });

  describe('publicIdFromUrl', () => {
    it.each([
      [
        'https://res.cloudinary.com/demo/image/upload/v1712/techrent/devices/abc.jpg',
        'techrent/devices/abc',
      ],
      [
        'https://res.cloudinary.com/demo/image/upload/techrent/devices/macbook/1-front.webp',
        'techrent/devices/macbook/1-front',
      ],
    ])('URL của project trong đúng thư mục → public_id', (url, expected) => {
      expect(service.publicIdFromUrl(url, 'techrent/devices')).toBe(expected);
    });

    it.each([
      'https://res.cloudinary.com/khac/image/upload/v1/techrent/devices/abc.jpg', // cloud khác
      'https://res.cloudinary.com/demo/image/upload/v1/techrent/avatars/abc.jpg', // thư mục khác
      'https://res.cloudinary.com/demo/image/upload/v1/techrent/kyc/abc.jpg',
      'https://evil.example.com/techrent/devices/abc.jpg',
      'https://res.cloudinary.com/demo/image/upload/v1/techrent/devices-fake/abc.jpg',
    ])(
      'URL không thuộc project/thư mục → null (không bao giờ xoá nhầm): %s',
      (url) => {
        expect(service.publicIdFromUrl(url, 'techrent/devices')).toBeNull();
      },
    );
  });
});
