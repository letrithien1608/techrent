import { Check, X } from "lucide-react";
import { cn } from "cn";
import type { BookingStatus } from "@/lib/bookings-api";

/**
 * Các bước của 1 đơn thuê theo thứ tự. Sắp tới thêm bước mới (thu tiền thuê,
 * trả máy, hoàn cọc, báo lỗi thiết bị...) chỉ cần chèn 1 phần tử vào đây —
 * `reachedBy` liệt kê các trạng thái mà ở đó bước này đã xong.
 */
export const BOOKING_FLOW: { key: string; label: string; reachedBy: BookingStatus[] }[] = [
  { key: "created", label: "Đặt thuê", reachedBy: ["pending", "confirmed", "ongoing", "completed"] },
  { key: "confirmed", label: "Xác nhận", reachedBy: ["confirmed", "ongoing", "completed"] },
  { key: "ongoing", label: "Nhận máy", reachedBy: ["ongoing", "completed"] },
  { key: "completed", label: "Hoàn tất", reachedBy: ["completed"] },
];

/** Dòng thời gian trạng thái đơn — ngang trên màn rộng, tự co chữ trên điện thoại. */
export function BookingStatusTimeline({ status }: { status: BookingStatus }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2 text-sm text-red-300">
        <span className="flex size-6 items-center justify-center rounded-full bg-red-500/15">
          <X className="size-3.5" aria-hidden />
        </span>
        Đơn đã huỷ
      </div>
    );
  }
  const currentIndex = BOOKING_FLOW.findIndex((step) => !step.reachedBy.includes(status));
  return (
    <ol className="flex w-full items-start" aria-label="Tiến trình đơn thuê">
      {BOOKING_FLOW.map((step, index) => {
        const done = step.reachedBy.includes(status);
        const current = index === currentIndex;
        return (
          <li key={step.key} className="flex flex-1 flex-col items-center gap-1.5 text-center last:flex-none">
            <div className="flex w-full items-center">
              <span
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  done
                    ? "border-primary bg-primary text-primary-foreground"
                    : current
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
              </span>
              {index < BOOKING_FLOW.length - 1 && (
                <span className={cn("mx-1 h-0.5 flex-1 rounded-full", done ? "bg-primary/70" : "bg-border")} />
              )}
            </div>
            <span
              className={cn(
                "-ml-1 self-start text-xs sm:text-[13px]",
                done || current ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
