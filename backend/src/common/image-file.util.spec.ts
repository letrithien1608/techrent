import { BadRequestException } from '@nestjs/common';
import { assertAllowedImage, detectImageType } from './image-file.util';

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);

describe('image-file.util — kiểm tra ảnh theo nội dung', () => {
  it.each([
    [JPG, 'image/jpeg'],
    [PNG, 'image/png'],
    [WEBP, 'image/webp'],
  ])('nhận diện đúng định dạng', (buffer, type) => {
    expect(detectImageType(buffer)).toBe(type);
  });

  it.each([
    ['GIF', Buffer.from('GIF89a......')],
    ['PDF', Buffer.from('%PDF-1.7....')],
    ['EXE đổi tên .jpg', Buffer.from('MZ\x90\x00\x03\x00')],
    ['SVG', Buffer.from('<svg xmlns=...')],
  ])('từ chối %s dù trình duyệt khai báo image/jpeg', (_label, buffer) => {
    expect(() =>
      assertAllowedImage({ buffer, size: buffer.length }, 5 * 1024 * 1024),
    ).toThrow('Chỉ nhận ảnh định dạng JPG, PNG hoặc WEBP');
  });

  it('vượt 5MB → 400', () => {
    expect(() =>
      assertAllowedImage(
        { buffer: JPG, size: 5 * 1024 * 1024 + 1 },
        5 * 1024 * 1024,
      ),
    ).toThrow('vượt quá 5MB');
  });

  it('không có file → 400', () => {
    expect(() => assertAllowedImage(undefined, 1000)).toThrow(
      BadRequestException,
    );
  });

  it('ảnh hợp lệ trả về loại đã nhận diện', () => {
    expect(assertAllowedImage({ buffer: PNG, size: 9 }, 1000)).toBe(
      'image/png',
    );
  });
});
