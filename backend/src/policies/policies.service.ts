import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  calculateDeposit,
  calculateLateFeeForDays,
  calculateRefundPercentage,
  DEFAULT_BOOKING_TTL_MINUTES,
  DEPOSIT_RATIO,
  HOURLY_PRICING_MAX_HOURS,
  LATE_FEE_DAILY_RATIO,
  REFUND_TIERS,
} from '../common/business-policy';

const EXAMPLE_ORIGINAL_PRICE = 30_000_000;
const EXAMPLE_PRICE_PER_DAY = 400_000;

/**
 * Chính sách thuê công khai cho trang /policies — số liệu và ví dụ đều tính
 * bằng chính các hàm nghiệp vụ trong business-policy.ts (nguồn sự thật duy
 * nhất, frontend không tự chép lại con số).
 */
@Injectable()
export class PoliciesService {
  constructor(private readonly configService: ConfigService) {}

  getRentalPolicy() {
    const bookingTtlMinutes = Number(
      this.configService.get<string>('BOOKING_TTL_MINUTES') ??
        DEFAULT_BOOKING_TTL_MINUTES,
    );
    return {
      depositRatio: DEPOSIT_RATIO,
      lateFeeDailyRatio: LATE_FEE_DAILY_RATIO,
      refundTiers: REFUND_TIERS,
      hourlyPricingMaxHours: HOURLY_PRICING_MAX_HOURS,
      bookingTtlMinutes,
      examples: {
        deposit: {
          originalPrice: EXAMPLE_ORIGINAL_PRICE,
          deposit: calculateDeposit(EXAMPLE_ORIGINAL_PRICE),
        },
        lateFee: {
          pricePerDay: EXAMPLE_PRICE_PER_DAY,
          byDays: [1, 2, 3].map((days) => ({
            days,
            total: calculateLateFeeForDays(
              days,
              EXAMPLE_PRICE_PER_DAY,
              Number.MAX_VALUE,
            ),
          })),
        },
        refund: [30, 10, 3].map((hoursBeforeStart) => ({
          hoursBeforeStart,
          percentage: calculateRefundPercentage(hoursBeforeStart, false),
        })),
      },
    };
  }
}
