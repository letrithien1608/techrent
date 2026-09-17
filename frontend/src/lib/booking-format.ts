import type { BookingStatus } from "./bookings-api";

export const BOOKING_STATUS_LABEL: Record<
  BookingStatus,
  { label: string; className: string }
> = {
  pending: { label: "Chờ thanh toán", className: "bg-amber-500/15 text-amber-400" },
  confirmed: { label: "Đã xác nhận", className: "bg-cyan-500/15 text-cyan-400" },
  ongoing: { label: "Đang thuê", className: "bg-blue-500/15 text-blue-400" },
  completed: { label: "Hoàn tất", className: "bg-emerald-500/15 text-emerald-400" },
  cancelled: { label: "Đã huỷ", className: "bg-muted text-muted-foreground" },
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
