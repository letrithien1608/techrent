// Nguồn sự thật DUY NHẤT cho các con số chính sách thuê thiết bị — dùng chung
// cho nghiệp vụ (BookingsService), mẫu hợp đồng (bookings/contract/contract-html.ts) và
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

/** Hoàn cọc bằng chuyển khoản thủ công trong tối đa N NGÀY LÀM VIỆC (T2–T6) kể từ khi trả máy/huỷ đơn. */
export const DEPOSIT_REFUND_BUSINESS_DAYS = 3;

/** Biên bản giao máy phải có tối thiểu N ảnh tình trạng thiết bị. */
export const HANDOVER_MIN_PHOTOS = 3;

/** Khi trả máy hư hỏng/thiếu phụ kiện phải có tối thiểu N ảnh minh chứng. */
export const RETURN_DAMAGE_MIN_PHOTOS = 1;

/**
 * Không giao hàng tận nơi — chỉ nhận/trả tại cửa hàng để nhân viên đối chiếu
 * CCCD gốc và ký hợp đồng trực tiếp với khách.
 */
export const STORE_PICKUP_ONLY = true;

/** Quá hạn trả máy từ N ngày trở lên → hệ thống đánh dấu "nghi mất thiết bị" và báo nhân viên. */
export const LOST_SUSPECT_OVERDUE_DAYS = 7;

/**
 * Khi xác nhận mất thiết bị: tổng cửa hàng đòi (tiền cọc giữ lại + nợ) không
 * vượt quá N lần giá trị thiết bị — chặn phí trễ hạn cộng dồn vô hạn.
 */
export const LOST_DEVICE_MAX_CLAIM_RATIO = 1.5;

/** Máy thay thế khi đổi máy: cùng danh mục, giá trị lệch tối đa ±N so với máy gốc. */
export const REPLACEMENT_VALUE_TOLERANCE = 0.2;

/** Tiền hoàn (thuê phần chưa dùng) làm tròn XUỐNG tới bội số này (VND). */
export const REFUND_ROUNDING_VND = 1000;

/** Mỗi đánh giá chỉ được sửa tối đa N lần trong 1 ngày (giờ Việt Nam). */
export const REVIEW_EDITS_PER_DAY = 5;

/** Múi giờ cửa hàng — dùng để xác định ngày làm việc (VN không có giờ mùa hè). */
const STORE_UTC_OFFSET_MS = 7 * HOUR_MS;

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

export interface RentalPricing {
  /** Tính theo giờ (≤ HOURLY_PRICING_MAX_HOURS) hay theo ngày. */
  unit: 'hour' | 'day';
  /** Số giờ/ngày tính tiền (đã làm tròn lên). */
  quantity: number;
  unitPrice: number;
  total: number;
  /** Tổng thời lượng thuê thực, làm tròn lên theo giờ. */
  totalHours: number;
}

/** Diễn giải cách tính tiền thuê — dùng cho hợp đồng; `calculateRentalPrice` dùng lại đúng hàm này. */
export function describeRentalPricing(
  pricePerHour: number,
  pricePerDay: number,
  start: Date,
  end: Date,
): RentalPricing {
  const durationMs = end.getTime() - start.getTime();
  const totalHours = Math.ceil(durationMs / HOUR_MS);
  if (durationMs <= HOURLY_PRICING_MAX_HOURS * HOUR_MS) {
    return {
      unit: 'hour',
      quantity: totalHours,
      unitPrice: pricePerHour,
      total: pricePerHour * totalHours,
      totalHours,
    };
  }
  const days = Math.ceil(durationMs / DAY_MS);
  return {
    unit: 'day',
    quantity: days,
    unitPrice: pricePerDay,
    total: pricePerDay * days,
    totalHours,
  };
}

export function calculateRentalPrice(
  pricePerHour: number,
  pricePerDay: number,
  start: Date,
  end: Date,
): number {
  return describeRentalPricing(pricePerHour, pricePerDay, start, end).total;
}

/** Đổi tỷ lệ 0.5 → "50%" để chèn vào văn bản (hợp đồng, kho kiến thức AI). */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export interface DepositSettlement {
  /** Tổng khấu trừ = phí trễ hạn + phí hư hỏng. */
  totalDeductions: number;
  /** Số tiền hoàn lại cho khách (không âm). */
  refundAmount: number;
  /** Phần khấu trừ vượt quá tiền cọc — khách còn nợ cửa hàng (không âm). */
  amountOwed: number;
}

/**
 * Quyết toán cọc khi trả máy: hoàn = cọc − phí trễ hạn − phí hư hỏng (− chi phí
 * sửa đã ghi khi báo lỗi). Nếu ra
 * số âm thì hoàn 0 và phần thiếu thành tiền khách còn nợ.
 */
export function calculateDepositSettlement(input: {
  depositAmount: number;
  lateFee: number;
  damageFee: number;
  /** Chi phí sửa do lỗi của khách đã ghi khi xử lý báo lỗi giữa kỳ thuê. */
  repairFee?: number;
}): DepositSettlement {
  const totalDeductions =
    input.lateFee + input.damageFee + (input.repairFee ?? 0);
  const balance = input.depositAmount - totalDeductions;
  return {
    totalDeductions,
    refundAmount: Math.max(balance, 0),
    amountOwed: Math.max(-balance, 0),
  };
}

function isStoreWeekend(date: Date): boolean {
  const day = new Date(date.getTime() + STORE_UTC_OFFSET_MS).getUTCDay();
  return day === 0 || day === 6;
}

/** Cộng N ngày làm việc (bỏ T7, CN theo giờ Việt Nam), giữ nguyên giờ trong ngày. Chưa tính ngày lễ. */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  let added = 0;
  while (added < days) {
    result.setTime(result.getTime() + DAY_MS);
    if (!isStoreWeekend(result)) added++;
  }
  return result;
}

/** Hạn chót hoàn cọc tính từ thời điểm phát sinh nghĩa vụ hoàn (trả máy/huỷ đơn). */
export function depositRefundDueAt(from: Date): Date {
  return addBusinessDays(from, DEPOSIT_REFUND_BUSINESS_DAYS);
}

/**
 * Kết thúc sớm do lỗi thiết bị: hoàn tiền thuê theo tỷ lệ thời gian CHƯA dùng
 * (tính từ lúc kết thúc tới hạn trả), làm tròn xuống REFUND_ROUNDING_VND.
 */
export function calculateUnusedRentalRefund(input: {
  totalPrice: number;
  startTime: Date;
  endTime: Date;
  endedAt: Date;
}): number {
  const total = input.endTime.getTime() - input.startTime.getTime();
  if (total <= 0) return 0;
  const used = Math.min(
    Math.max(input.endedAt.getTime() - input.startTime.getTime(), 0),
    total,
  );
  const refund = (input.totalPrice * (total - used)) / total;
  return Math.floor(refund / REFUND_ROUNDING_VND) * REFUND_ROUNDING_VND;
}

/**
 * Xác nhận mất thiết bị: giữ toàn bộ cọc, nợ = giá trị máy − cọc + phí trễ
 * hạn, sao cho (cọc + nợ) ≤ LOST_DEVICE_MAX_CLAIM_RATIO × giá trị máy.
 */
export function calculateLostDeviceDebt(input: {
  originalPrice: number;
  depositAmount: number;
  lateFee: number;
}): { lateFee: number; amountOwed: number } {
  const maxClaim = input.originalPrice * LOST_DEVICE_MAX_CLAIM_RATIO;
  const lateFee = Math.max(
    Math.min(input.lateFee, maxClaim - input.originalPrice),
    0,
  );
  const amountOwed = Math.max(
    input.originalPrice + lateFee - input.depositAmount,
    0,
  );
  return { lateFee, amountOwed };
}

/** Giá trị máy thay thế có nằm trong khoảng tương đương với máy gốc không. */
export function isEquivalentValue(
  originalPrice: number,
  candidatePrice: number,
): boolean {
  return (
    Math.abs(candidatePrice - originalPrice) <=
    originalPrice * REPLACEMENT_VALUE_TOLERANCE
  );
}

/** Ngày theo giờ cửa hàng (VN), dạng "YYYY-MM-DD" — dùng cho giới hạn theo ngày. */
export function storeDayKey(date: Date): string {
  return new Date(date.getTime() + STORE_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}
