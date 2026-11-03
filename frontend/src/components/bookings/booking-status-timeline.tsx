import { Check, X } from "lucide-react";
import { cn } from "cn";
import type { Booking } from "@/lib/bookings-api";

type TimelineBooking = Pick<Booking, "status" | "depositRefundStatus">;

const AFTER_DEPOSIT = ["confirmed", "ongoing", "completed"];
const AFTER_HANDOVER = ["ongoing", "completed"];

/**
 * Các bước của 1 đơn thuê theo thứ tự. Thêm bước mới chỉ cần chèn 1 phần tử —
 * `reached` trả về true khi bước đó đã xong (đọc cả trạng thái đơn lẫn trạng
 * thái hoàn cọc). Bước đầu tiên chưa xong là bước "hiện tại".
 */
export const BOOKING_FLOW: {
  key: string;
  label: string;
  reached: (booking: TimelineBooking) => boolean;
}[] = [
  { key: "created", label: "Đặt thuê", reached: () => true },
  { key: "deposit", label: "Đã cọc", reached: (b) => AFTER_DEPOSIT.includes(b.status) },
  { key: "handover", label: "Nhận máy", reached: (b) => AFTER_HANDOVER.includes(b.status) },
  { key: "renting", label: "Đang thuê", reached: (b) => b.status === "completed" },
  { key: "returned", label: "Đã trả máy", reached: (b) => b.status === "completed" },
  {
    key: "refund",
    label: "Hoàn cọc",
    reached: (b) => b.depositRefundStatus === "refunded" || b.depositRefundStatus === "not_refunded",
  },
];

/** Dòng thời gian trạng thái đơn — ngang trên màn rộng, tự co chữ trên điện thoại. */
export function BookingStatusTimeline({ booking }: { booking: TimelineBooking }) {
  if (booking.status === "cancelled" || booking.status === "lost") {
    return (
      <div className="flex items-center gap-2 text-sm text-red-300">
        <span className="flex size-6 items-center justify-center rounded-full bg-red-500/15">
          <X className="size-3.5" aria-hidden />
        </span>
        {booking.status === "lost" ? "Thiết bị không được trả — đã xác nhận mất" : "Đơn đã huỷ"}
      </div>
    );
  }
  // Đơn cũ (trước khi theo dõi hoàn cọc) đã hoàn tất: coi như xong hết.
  const legacyDone = booking.status === "completed" && (booking.depositRefundStatus ?? "none") === "none";
  const steps = BOOKING_FLOW.map((step) => ({
    ...step,
    done: legacyDone || step.reached(booking),
    label:
      step.key === "refund" && booking.depositRefundStatus === "not_refunded" ? "Không hoàn cọc" : step.label,
  }));
  const currentIndex = steps.findIndex((step) => !step.done);
  return (
    <ol className="flex w-full items-start" aria-label="Tiến trình đơn thuê">
      {steps.map((step, index) => {
        const current = index === currentIndex;
        return (
          <li key={step.key} className="flex flex-1 flex-col items-center gap-1.5 text-center last:flex-none">
            <div className="flex w-full items-center">
              <span
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  step.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : current
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {step.done ? <Check className="size-3.5" aria-hidden /> : index + 1}
              </span>
              {index < steps.length - 1 && (
                <span className={cn("mx-1 h-0.5 flex-1 rounded-full", step.done ? "bg-primary/70" : "bg-border")} />
              )}
            </div>
            <span
              className={cn(
                "-ml-1 self-start text-[11px] leading-tight sm:text-[13px]",
                step.done || current ? "text-foreground" : "text-muted-foreground",
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
