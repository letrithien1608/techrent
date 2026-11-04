import { ConfigService } from '@nestjs/config';
import {
  DEPOSIT_RATIO,
  LATE_FEE_DAILY_RATIO,
  REFUND_TIERS,
} from '../common/business-policy';
import { PoliciesService } from './policies.service';

describe('PoliciesService', () => {
  const service = new PoliciesService({
    get: () => '5',
  } as unknown as ConfigService);

  it('trả đúng hằng số từ business-policy.ts', () => {
    const policy = service.getRentalPolicy();
    expect(policy.depositRatio).toBe(DEPOSIT_RATIO);
    expect(policy.lateFeeDailyRatio).toBe(LATE_FEE_DAILY_RATIO);
    expect(policy.refundTiers).toBe(REFUND_TIERS);
    expect(policy.bookingTtlMinutes).toBe(5);
  });

  it('ví dụ tính bằng hàm nghiệp vụ (phạt leo thang cộng dồn, hoàn cọc theo bậc)', () => {
    const { examples } = service.getRentalPolicy();
    expect(examples.deposit.deposit).toBe(15_000_000);
    expect(examples.lateFee.byDays.map((d) => d.total)).toEqual([
      80_000, 240_000, 480_000,
    ]);
    expect(examples.refund.map((r) => r.percentage)).toEqual([100, 50, 0]);
  });

  it('quy tắc đánh giá lấy từ hằng số nghiệp vụ', () => {
    expect(service.getRentalPolicy().reviews).toEqual({
      editsPerDay: 5,
      commentMin: 10,
      commentMax: 1000,
    });
  });
});
