import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  calculateDeposit,
  calculateLateFeeForDays,
  calculateRefundPercentage,
  calculateDepositSettlement,
  calculateLostDeviceDebt,
  calculateUnusedRentalRefund,
  DAY_MS,
  LOST_DEVICE_MAX_CLAIM_RATIO,
  LOST_SUSPECT_OVERDUE_DAYS,
  REPLACEMENT_VALUE_TOLERANCE,
  DEFAULT_BOOKING_TTL_MINUTES,
  DEPOSIT_RATIO,
  DEPOSIT_REFUND_BUSINESS_DAYS,
  HANDOVER_MIN_PHOTOS,
  STORE_PICKUP_ONLY,
  HOURLY_PRICING_MAX_HOURS,
  LATE_FEE_DAILY_RATIO,
  REFUND_TIERS,
  REVIEW_EDITS_PER_DAY,
} from '../common/business-policy';
import {
  REVIEW_COMMENT_MAX,
  REVIEW_COMMENT_MIN,
} from '../reviews/review-content.util';

const EXAMPLE_ORIGINAL_PRICE = 30_000_000;
const EXAMPLE_PRICE_PER_DAY = 400_000;
const EXAMPLE_DAMAGE_FEE = 1_000_000;

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
      depositRefundBusinessDays: DEPOSIT_REFUND_BUSINESS_DAYS,
      handoverMinPhotos: HANDOVER_MIN_PHOTOS,
      storePickupOnly: STORE_PICKUP_ONLY,
      lostSuspectOverdueDays: LOST_SUSPECT_OVERDUE_DAYS,
      lostDeviceMaxClaimRatio: LOST_DEVICE_MAX_CLAIM_RATIO,
      replacementValueTolerance: REPLACEMENT_VALUE_TOLERANCE,
      reviews: {
        editsPerDay: REVIEW_EDITS_PER_DAY,
        commentMin: REVIEW_COMMENT_MIN,
        commentMax: REVIEW_COMMENT_MAX,
      },
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
        // Trả máy trễ 1 ngày + phí hư hỏng 1.000.000đ, cọc 15.000.000đ.
        settlement: {
          depositAmount: calculateDeposit(EXAMPLE_ORIGINAL_PRICE),
          lateFee: calculateLateFeeForDays(
            1,
            EXAMPLE_PRICE_PER_DAY,
            Number.MAX_VALUE,
          ),
          damageFee: EXAMPLE_DAMAGE_FEE,
          ...calculateDepositSettlement({
            depositAmount: calculateDeposit(EXAMPLE_ORIGINAL_PRICE),
            lateFee: calculateLateFeeForDays(
              1,
              EXAMPLE_PRICE_PER_DAY,
              Number.MAX_VALUE,
            ),
            damageFee: EXAMPLE_DAMAGE_FEE,
          }),
        },
        // Thuê 4 ngày, máy hỏng sau 1 ngày → kết thúc sớm.
        earlyEnd: {
          totalPrice: EXAMPLE_PRICE_PER_DAY * 4,
          daysUsed: 1,
          rentalRefund: calculateUnusedRentalRefund({
            totalPrice: EXAMPLE_PRICE_PER_DAY * 4,
            startTime: new Date(0),
            endTime: new Date(4 * DAY_MS),
            endedAt: new Date(DAY_MS),
          }),
        },
        // Không trả máy, quá hạn LOST_SUSPECT_OVERDUE_DAYS + 1 ngày.
        lost: {
          originalPrice: EXAMPLE_ORIGINAL_PRICE,
          depositAmount: calculateDeposit(EXAMPLE_ORIGINAL_PRICE),
          overdueDays: LOST_SUSPECT_OVERDUE_DAYS + 1,
          ...calculateLostDeviceDebt({
            originalPrice: EXAMPLE_ORIGINAL_PRICE,
            depositAmount: calculateDeposit(EXAMPLE_ORIGINAL_PRICE),
            lateFee: calculateLateFeeForDays(
              LOST_SUSPECT_OVERDUE_DAYS + 1,
              EXAMPLE_PRICE_PER_DAY,
              EXAMPLE_ORIGINAL_PRICE,
            ),
          }),
        },
        refund: [30, 10, 3].map((hoursBeforeStart) => ({
          hoursBeforeStart,
          percentage: calculateRefundPercentage(hoursBeforeStart, false),
        })),
      },
    };
  }
}
