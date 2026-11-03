"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { fetchMyDebt } from "@/lib/bookings-api";
import { formatVnd } from "@/lib/device-format";

/**
 * Nhắc khách đang còn nợ (quyết toán trả máy âm hoặc mất thiết bị) — chỉ hiện
 * khi có nợ. Backend chặn đặt thuê mới cho tới khi trả hết.
 */
export function DebtNotice({ className }: { className?: string }) {
  const query = useQuery({ queryKey: ["debts", "me"], queryFn: fetchMyDebt });
  const debt = query.data;
  if (!debt || debt.total <= 0) return null;
  return (
    <div
      id="debt"
      role="alert"
      className={`scroll-mt-24 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm ${className ?? ""}`}
    >
      <div className="flex items-start gap-3">
        <HandCoins className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-destructive">Bạn còn nợ {formatVnd(debt.total)}</p>
          <p className="mt-1 text-foreground/80">
            Vui lòng thanh toán tại cửa hàng (tiền mặt hoặc chuyển khoản). Bạn chưa thể đặt thuê mới cho tới khi
            thanh toán hết.
          </p>
          <ul className="mt-2 space-y-1">
            {debt.bookings.map((line) => (
              <li key={line.bookingId} className="flex flex-wrap justify-between gap-2">
                <Link href={`/bookings/${line.bookingId}`} className="text-primary hover:underline">
                  {line.device.name} (đơn #{line.bookingId.slice(0, 8).toUpperCase()})
                </Link>
                <span className="font-medium tabular-nums">
                  {formatVnd(line.outstanding)}
                  {line.debtPaidAmount > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">(đã trả {formatVnd(line.debtPaidAmount)})</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
