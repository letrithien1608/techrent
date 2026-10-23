import {
  calculateDeposit,
  calculateLateFee,
  calculateLateFeeForDays,
  calculateRefundPercentage,
  calculateRentalPrice,
  DAY_MS,
  HOUR_MS,
} from './business-policy';

describe('business-policy', () => {
  it('cọc = 50% giá gốc thiết bị', () => {
    expect(calculateDeposit(30_000_000)).toBe(15_000_000);
  });

  it('hoàn cọc theo bậc 24h/6h, lỗi cửa hàng luôn 100%', () => {
    expect(calculateRefundPercentage(30, false)).toBe(100);
    expect(calculateRefundPercentage(24, false)).toBe(100);
    expect(calculateRefundPercentage(10, false)).toBe(50);
    expect(calculateRefundPercentage(2, false)).toBe(0);
    expect(calculateRefundPercentage(2, true)).toBe(100);
  });

  it('phí trễ hạn leo thang cộng dồn, không phải phẳng', () => {
    // 400k/ngày, trễ 2 ngày: 80k + 160k = 240k (khác 2 × 80k)
    expect(calculateLateFeeForDays(2, 400_000, 50_000_000)).toBe(240_000);
    expect(calculateLateFeeForDays(3, 400_000, 50_000_000)).toBe(480_000);
  });

  it('phí trễ hạn chặn trên ở giá trị thiết bị', () => {
    expect(calculateLateFeeForDays(30, 400_000, 1_000_000)).toBe(1_000_000);
  });

  it('trễ vài giờ vẫn làm tròn lên 1 ngày, trả đúng hạn thì 0', () => {
    const end = new Date('2026-10-01T10:00:00Z');
    expect(
      calculateLateFee(
        new Date(end.getTime() + 3 * HOUR_MS),
        end,
        400_000,
        9e9,
      ),
    ).toBe(80_000);
    expect(calculateLateFee(end, end, 400_000, 9e9)).toBe(0);
  });

  it('≤ 24 giờ tính theo giờ, > 24 giờ tính theo ngày (làm tròn lên)', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    expect(
      calculateRentalPrice(
        50_000,
        300_000,
        start,
        new Date(start.getTime() + 3 * HOUR_MS),
      ),
    ).toBe(150_000);
    expect(
      calculateRentalPrice(
        50_000,
        300_000,
        start,
        new Date(start.getTime() + DAY_MS + HOUR_MS),
      ),
    ).toBe(600_000);
  });
});
