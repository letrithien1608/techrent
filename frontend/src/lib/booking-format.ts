import type {
  Booking,
  BookingStatus,
  DepositRefundStatus,
  DeviceCondition,
  RentalPaymentMethod,
} from "./bookings-api";

export const BOOKING_STATUS_LABEL: Record<
  BookingStatus,
  { label: string; className: string }
> = {
  pending: { label: "Chờ thanh toán", className: "bg-amber-500/15 text-amber-400" },
  confirmed: { label: "Đã xác nhận", className: "bg-cyan-500/15 text-cyan-400" },
  ongoing: { label: "Đang thuê", className: "bg-blue-500/15 text-blue-400" },
  completed: { label: "Đã trả máy", className: "bg-emerald-500/15 text-emerald-400" },
  cancelled: { label: "Đã huỷ", className: "bg-muted text-muted-foreground" },
  lost: { label: "Mất thiết bị", className: "bg-red-500/20 text-red-300" },
};

/**
 * Ước tính % hoàn cọc theo đúng chính sách mục 4.2 Roadmap — CHỈ để hiển thị
 * xem trước cho khách trước khi họ xác nhận huỷ. Backend (`BookingsService.cancel()`)
 * mới là nơi tính toán và áp dụng chính thức, số ở đây có thể lệch vài giây so
 * với lúc backend thực sự xử lý (không sao vì chỉ mang tính minh bạch tham khảo).
 */
export function estimateRefundPercentage(startTime: string | Date): number {
  const start = typeof startTime === "string" ? new Date(startTime) : startTime;
  const hoursUntilStart = (start.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hoursUntilStart >= 24) return 100;
  if (hoursUntilStart >= 6) return 50;
  return 0;
}

export const RENTAL_PAYMENT_METHOD_LABEL: Record<RentalPaymentMethod, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
};

export const DEVICE_CONDITION_LABEL: Record<DeviceCondition, string> = {
  intact: "Nguyên vẹn",
  damaged: "Hư hỏng",
  missing_accessories: "Thiếu phụ kiện",
};

export const DEPOSIT_REFUND_STATUS_LABEL: Record<
  DepositRefundStatus,
  { label: string; className: string }
> = {
  none: { label: "Chưa tới bước hoàn cọc", className: "bg-muted text-muted-foreground" },
  pending: { label: "Chờ hoàn cọc", className: "bg-amber-500/15 text-amber-400" },
  refunded: { label: "Đã hoàn cọc", className: "bg-emerald-500/15 text-emerald-400" },
  not_refunded: { label: "Không hoàn cọc", className: "bg-red-500/15 text-red-300" },
};

/** Khoản cọc chờ hoàn đã quá hạn chuyển khoản. */
export function isRefundOverdue(booking: Pick<Booking, "depositRefundStatus" | "depositRefundDueAt">, now = Date.now()): boolean {
  return (
    booking.depositRefundStatus === "pending" &&
    !!booking.depositRefundDueAt &&
    new Date(booking.depositRefundDueAt).getTime() < now
  );
}
