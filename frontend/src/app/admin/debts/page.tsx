"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, ShieldAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CollectDebtDialog } from "@/components/admin/collect-debt-dialog";
import { fetchDebtors } from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL, RENTAL_PAYMENT_METHOD_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";

/** Khách đang nợ (quyết toán trả máy âm, mất thiết bị) — nợ nhiều nhất trước. */
export default function AdminDebtsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "debts"], queryFn: fetchDebtors });
  const debtors = query.data ?? [];
  const total = debtors.reduce((sum, d) => sum + d.total, 0);

  function handleCollected() {
    queryClient.invalidateQueries({ queryKey: ["admin"] });
  }

  if (query.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center">
        <WifiOff className="size-10 text-muted-foreground/50" />
        <p className="text-muted-foreground">Không thể tải danh sách công nợ.</p>
        <Button onClick={() => query.refetch()}>Thử lại</Button>
      </div>
    );
  }
  if (debtors.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-16 text-center">
        <HandCoins className="size-10 text-muted-foreground/40" />
        <p className="text-muted-foreground">Không có khách nào đang nợ.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {debtors.length} khách đang nợ · tổng <strong className="text-destructive">{formatVnd(total)}</strong>. Khách
        còn nợ bị chặn đặt thuê mới cho tới khi trả hết.
      </p>
      {debtors.map((debtor) => (
        <section key={debtor.user.id} className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
            <div>
              <p className="font-semibold">
                {debtor.user.name}
                {debtor.user.isBlacklisted && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                    <ShieldAlert className="size-3" />
                    Danh sách đen
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {debtor.user.email}
                {debtor.user.phone && ` · ${debtor.user.phone}`}
              </p>
            </div>
            <p className="text-lg font-bold tabular-nums text-destructive">{formatVnd(debtor.total)}</p>
          </header>
          <ul className="divide-y divide-border/50">
            {debtor.bookings.map((line) => (
              <li key={line.bookingId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <Link
                    href={`/admin/bookings?bookingId=${line.bookingId}`}
                    className="font-medium hover:text-primary"
                  >
                    {line.device.name}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">
                    #{line.bookingId.slice(0, 8).toUpperCase()} · {BOOKING_STATUS_LABEL[line.status].label}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Nợ {formatVnd(line.amountOwed)}
                    {line.debtPaidAmount > 0 && ` · đã thu ${formatVnd(line.debtPaidAmount)}`}
                  </p>
                  {line.payments.map((p) => (
                    <p key={p.id} className="text-xs text-muted-foreground">
                      {formatDateTimeVi(p.createdAt)}: thu {formatVnd(p.amount)} ({RENTAL_PAYMENT_METHOD_LABEL[p.method].toLowerCase()})
                      {p.note && ` — ${p.note}`}
                    </p>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatVnd(line.outstanding)}</span>
                  <CollectDebtDialog line={line} customerName={debtor.user.name} onCollected={handleCollected} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
