// Nguồn sự thật DUY NHẤT cho các con số chính sách thuê thiết bị — dùng chung
// cho nghiệp vụ (BookingsService), mẫu hợp đồng (contract-template.util.ts) và
// Trợ lý AI (KnowledgeService điền vào kho kiến thức lúc runtime). Đổi số ở đây
// thì cả 3 nơi tự đổi theo, không có bản chép tay nào bị lệch.
//
// Hàm thuần (không NestJS DI) — cùng style `vnpay.util.ts`/`cccd-crypto.util.ts`.

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Tiền cọc = % GIÁ GỐC thiết bị (originalPrice — giá trị tài sản), KHÔNG PHẢI
 * % tổng tiền thuê: thuê 1 giờ hay 1 tuần thì rủi ro mất/hỏng thiết bị là như nhau.
 */
export const DEPOSIT_RATIO = 0.5;

/**
 * Phí trễ hạn LEO THANG: ngày trễ thứ N phạt `LATE_FEE_DAILY_RATIO * N` lần giá
 * thuê/ngày (ngày 1: 20%, ngày 2: thêm 40%, ngày 3: thêm 60%...), cộng dồn mọi
 * ngày trễ, chặn trên ở giá trị thiết bị (originalPrice).
 */
export const LATE_FEE_DAILY_RATIO = 0.2;

/** Bậc hoàn cọc khi huỷ — xét theo số giờ còn lại tới giờ nhận thiết bị. */
export const REFUND_TIERS: ReadonlyArray<{
  minHoursBeforeStart: number;
  percentage: number;
}> = [
  { minHoursBeforeStart: 24, percentage: 100 },
  { minHoursBeforeStart: 6, percentage: 50 },
];

/** Thời lượng thuê ≤ ngưỡng này tính theo giờ (làm tròn lên), lớn hơn tính theo ngày. */
export const HOURLY_PRICING_MAX_HOURS = 24;

/** TTL mặc định (phút) giữ chỗ booking `pending` chưa thanh toán — ghi đè qua env BOOKING_TTL_MINUTES. */
export const DEFAULT_BOOKING_TTL_MINUTES = 5;

export function calculateDeposit(originalPrice: number): number {
  return originalPrice * DEPOSIT_RATIO;
}

export function calculateRefundPercentage(
  hoursUntilStart: number,
  storeFault: boolean,
): number {
  if (storeFault) return 100;
  for (const tier of REFUND_TIERS) {
    if (hoursUntilStart >= tier.minHoursBeforeStart) return tier.percentage;
  }
  return 0;
}

/** Phí trễ hạn tính theo SỐ NGÀY trễ (đã làm tròn lên) — dùng cho cả nghiệp vụ lẫn ví dụ của Trợ lý AI. */
export function calculateLateFeeForDays(
  daysLate: number,
  pricePerDay: number,
  deviceOriginalPrice: number,
): number {
  let total = 0;
  for (let day = 1; day <= daysLate; day++) {
    total += pricePerDay * LATE_FEE_DAILY_RATIO * day;
  }
  return Math.min(total, deviceOriginalPrice);
}

export function calculateLateFee(
  returnedAt: Date,
  expectedEndTime: Date,
  pricePerDay: number,
  deviceOriginalPrice: number,
): number {
  const lateMs = returnedAt.getTime() - expectedEndTime.getTime();
  if (lateMs <= 0) return 0;
  return calculateLateFeeForDays(
    Math.ceil(lateMs / DAY_MS),
    pricePerDay,
    deviceOriginalPrice,
  );
}

export function calculateRentalPrice(
  pricePerHour: number,
  pricePerDay: number,
  start: Date,
  end: Date,
): number {
  const durationMs = end.getTime() - start.getTime();
  if (durationMs <= HOURLY_PRICING_MAX_HOURS * HOUR_MS) {
    return pricePerHour * Math.ceil(durationMs / HOUR_MS);
  }
  return pricePerDay * Math.ceil(durationMs / DAY_MS);
}

/** Đổi tỷ lệ 0.5 → "50%" để chèn vào văn bản (hợp đồng, kho kiến thức AI). */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
