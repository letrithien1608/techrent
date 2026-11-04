import { DEFAULT_DATABASE_POOL_MAX, resolvePoolMax } from './prisma.service';

describe('resolvePoolMax', () => {
  it('không đặt env → mặc định 20', () => {
    expect(resolvePoolMax(undefined)).toBe(DEFAULT_DATABASE_POOL_MAX);
    expect(DEFAULT_DATABASE_POOL_MAX).toBe(20);
  });

  it('nhận số nguyên dương', () => {
    expect(resolvePoolMax('30')).toBe(30);
  });

  it('giá trị sai (chữ, 0, âm, số lẻ) → mặc định', () => {
    for (const raw of ['abc', '0', '-5', '2.5', '']) {
      expect(resolvePoolMax(raw)).toBe(DEFAULT_DATABASE_POOL_MAX);
    }
  });
});
