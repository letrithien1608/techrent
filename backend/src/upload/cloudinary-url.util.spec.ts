import {
  DEVICE_IMAGE_FOLDER,
  deleteDeviceImagesIfUnused,
  publicIdFromCloudinaryUrl,
} from './cloudinary-url.util';

const cdn = (path: string, cloud = 'demo') =>
  `https://res.cloudinary.com/${cloud}/image/upload/v17/${path}.jpg`;

describe('publicIdFromCloudinaryUrl', () => {
  it('chỉ nhận ảnh đúng cloud + đúng thư mục', () => {
    expect(
      publicIdFromCloudinaryUrl(
        cdn('techrent/devices/a/1-front'),
        'demo',
        DEVICE_IMAGE_FOLDER,
      ),
    ).toBe('techrent/devices/a/1-front');
    expect(
      publicIdFromCloudinaryUrl(
        cdn('techrent/devices/a', 'khac'),
        'demo',
        DEVICE_IMAGE_FOLDER,
      ),
    ).toBeNull();
    expect(
      publicIdFromCloudinaryUrl(
        cdn('techrent/kyc/x'),
        'demo',
        DEVICE_IMAGE_FOLDER,
      ),
    ).toBeNull();
    expect(
      publicIdFromCloudinaryUrl(
        'https://images.unsplash.com/a.jpg',
        'demo',
        DEVICE_IMAGE_FOLDER,
      ),
    ).toBeNull();
    expect(
      publicIdFromCloudinaryUrl(
        cdn('techrent/devices/a'),
        undefined,
        DEVICE_IMAGE_FOLDER,
      ),
    ).toBeNull();
  });
});

describe('deleteDeviceImagesIfUnused', () => {
  function deps(usedBy: Record<string, number> = {}) {
    return {
      prisma: {
        device: {
          count: jest.fn(({ where }: { where: { images: { has: string } } }) =>
            Promise.resolve(usedBy[where.images.has] ?? 0),
          ),
        },
      },
      publicIdFromUrl: (url: string) =>
        publicIdFromCloudinaryUrl(url, 'demo', DEVICE_IMAGE_FOLDER),
      deleteImage: jest.fn().mockResolvedValue(undefined),
      warn: jest.fn(),
    };
  }

  it('xoá ảnh không ai dùng, bỏ qua ảnh dùng chung, ảnh ngoài thư mục và URL trùng', async () => {
    const shared = cdn('techrent/devices/chung');
    const d = deps({ [shared]: 2 });
    const deleted = await deleteDeviceImagesIfUnused(d, [
      cdn('techrent/devices/a'),
      cdn('techrent/devices/a'),
      shared,
      cdn('techrent/inspections/b/handover'),
    ]);
    expect(deleted).toEqual(['techrent/devices/a']);
    expect(d.deleteImage).toHaveBeenCalledTimes(1);
  });

  it('lỗi đếm CSDL hoặc Cloudinary chỉ ghi log, ảnh khác vẫn được xử lý', async () => {
    const d = deps();
    d.deleteImage
      .mockRejectedValueOnce(new Error('cdn'))
      .mockResolvedValueOnce(undefined);
    const deleted = await deleteDeviceImagesIfUnused(d, [
      cdn('techrent/devices/a'),
      cdn('techrent/devices/b'),
    ]);
    expect(deleted).toEqual(['techrent/devices/b']);
    expect(d.warn).toHaveBeenCalledWith(
      expect.stringContaining('techrent/devices/a'),
    );

    d.prisma.device.count.mockRejectedValueOnce(new Error('db'));
    await expect(
      deleteDeviceImagesIfUnused(d, [cdn('techrent/devices/c')]),
    ).resolves.toEqual([]);
  });
});
