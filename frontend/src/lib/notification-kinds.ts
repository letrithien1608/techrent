import {
  AlarmClock,
  Banknote,
  Bell,
  HandCoins,
  SearchX,
  TriangleAlert,
  CalendarClock,
  CircleCheck,
  CircleX,
  ClipboardList,
  CreditCard,
  PackageCheck,
  PackageOpen,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type NotificationCategory = "booking" | "payment" | "reminder" | "identity" | "maintenance" | "system";

export interface NotificationKind {
  label: string;
  icon: LucideIcon;
  /** Màu nền + màu icon của ô biểu tượng. */
  tone: string;
  category: NotificationCategory;
}

/**
 * Bảng loại thông báo → cách hiển thị. Thêm trạng thái/sự kiện mới (thu tiền
 * thuê, trả máy, hoàn cọc, báo lỗi thiết bị...) chỉ cần thêm 1 dòng ở đây và
 * 1 nhánh ở backend `notification-templates.ts` — danh sách, bộ lọc và trang
 * /notifications tự nhận.
 */
export const NOTIFICATION_KINDS: Record<string, NotificationKind> = {
  booking_pending: { label: "Đơn mới", icon: ClipboardList, tone: "bg-cyan-500/15 text-cyan-300", category: "booking" },
  booking_confirmed: { label: "Đã xác nhận", icon: CircleCheck, tone: "bg-emerald-500/15 text-emerald-300", category: "booking" },
  booking_paid: { label: "Đã thanh toán", icon: CreditCard, tone: "bg-emerald-500/15 text-emerald-300", category: "payment" },
  booking_ongoing: { label: "Đang thuê", icon: PackageCheck, tone: "bg-blue-500/15 text-blue-300", category: "booking" },
  booking_rental_paid: { label: "Đã thu tiền thuê", icon: CreditCard, tone: "bg-emerald-500/15 text-emerald-300", category: "payment" },
  booking_returned: { label: "Đã trả máy", icon: PackageOpen, tone: "bg-cyan-500/15 text-cyan-300", category: "booking" },
  booking_deposit_refunded: { label: "Đã hoàn cọc", icon: Banknote, tone: "bg-emerald-500/15 text-emerald-300", category: "payment" },
  issue_reported: { label: "Báo lỗi thiết bị", icon: TriangleAlert, tone: "bg-amber-500/15 text-amber-300", category: "maintenance" },
  issue_resolved: { label: "Đã xử lý báo lỗi", icon: Wrench, tone: "bg-emerald-500/15 text-emerald-300", category: "maintenance" },
  booking_suspected_lost: { label: "Nghi mất thiết bị", icon: AlarmClock, tone: "bg-red-500/15 text-red-300", category: "reminder" },
  booking_lost: { label: "Mất thiết bị", icon: SearchX, tone: "bg-red-500/15 text-red-300", category: "booking" },
  debt_paid: { label: "Đã thu nợ", icon: HandCoins, tone: "bg-emerald-500/15 text-emerald-300", category: "payment" },
  booking_cancelled: { label: "Đã huỷ", icon: CircleX, tone: "bg-red-500/15 text-red-300", category: "booking" },
  booking_due_soon: { label: "Sắp đến hạn trả", icon: CalendarClock, tone: "bg-amber-500/15 text-amber-300", category: "reminder" },
  booking_overdue: { label: "Trễ hạn", icon: AlarmClock, tone: "bg-red-500/15 text-red-300", category: "reminder" },
  kyc_verified: { label: "Xác thực", icon: ShieldCheck, tone: "bg-violet-500/15 text-violet-300", category: "identity" },
  maintenance_reported: { label: "Báo hỏng", icon: Wrench, tone: "bg-orange-500/15 text-orange-300", category: "maintenance" },
};

const FALLBACK_KIND: NotificationKind = {
  label: "Hệ thống",
  icon: Bell,
  tone: "bg-slate-500/15 text-slate-300",
  category: "system",
};

export function notificationKind(type: string): NotificationKind {
  return NOTIFICATION_KINDS[type] ?? FALLBACK_KIND;
}

export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, string> = {
  booking: "Đơn thuê",
  payment: "Thanh toán",
  reminder: "Nhắc hạn",
  identity: "Xác thực",
  maintenance: "Bảo trì",
  system: "Hệ thống",
};

/** Danh sách type thuộc 1 nhóm — dùng làm tham số `types` khi lọc ở backend. */
export function typesOfCategory(category: NotificationCategory): string[] {
  return Object.entries(NOTIFICATION_KINDS)
    .filter(([, kind]) => kind.category === category)
    .map(([type]) => type);
}

const relativeFormatter = new Intl.RelativeTimeFormat("vi", { numeric: "auto" });

/** "5 phút trước", "hôm qua"... */
export function formatRelativeTime(iso: string, now = Date.now()): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return "vừa xong";
  if (abs < 3600) return relativeFormatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86_400) return relativeFormatter.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 7 * 86_400) return relativeFormatter.format(Math.round(diffSeconds / 86_400), "day");
  return new Date(iso).toLocaleDateString("vi-VN");
}

export function formatFullDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export type DayGroup = "Hôm nay" | "Hôm qua" | "Trước đó";

/** Nhóm theo ngày (giữ nguyên thứ tự mới → cũ). */
export function groupByDay<T extends { createdAt: string }>(
  items: T[],
  now = new Date(),
): { label: DayGroup; items: T[] }[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const groups: { label: DayGroup; items: T[] }[] = [];
  for (const item of items) {
    const time = new Date(item.createdAt).getTime();
    const label: DayGroup = time >= startOfToday ? "Hôm nay" : time >= startOfYesterday ? "Hôm qua" : "Trước đó";
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
