const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Khớp `PoliciesService.getRentalPolicy()` — số liệu tính từ business-policy.ts ở backend. */
export interface RentalPolicy {
  depositRatio: number;
  lateFeeDailyRatio: number;
  refundTiers: { minHoursBeforeStart: number; percentage: number }[];
  hourlyPricingMaxHours: number;
  bookingTtlMinutes: number;
  examples: {
    deposit: { originalPrice: number; deposit: number };
    lateFee: { pricePerDay: number; byDays: { days: number; total: number }[] };
    refund: { hoursBeforeStart: number; percentage: number }[];
  };
}

/** `null` nếu backend không trả lời — trang tự hiện trạng thái lỗi, không bịa số dự phòng. */
export async function fetchRentalPolicy(): Promise<RentalPolicy | null> {
  try {
    const res = await fetch(`${API_URL}/policies/rental`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as RentalPolicy;
  } catch {
    return null;
  }
}
