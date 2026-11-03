"use client";

import { cn } from "cn";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { BookingDetailDialog } from "@/components/admin/booking-detail-dialog";
import { DepositRefundDialog } from "@/components/admin/deposit-refund-dialog";
import { fetchBookings, type DepositRefundStatus } from "@/lib/bookings-api";
import { DEPOSIT_REFUND_STATUS_LABEL, isRefundOverdue } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";

const PAGE_SIZE = 20;

const TABS: { value: Exclude<DepositRefundStatus, "none">; label: string }[] = [
  { value: "pending", label: "Chờ hoàn" },
  { value: "refunded", label: "Đã hoàn" },
  { value: "not_refunded", label: "Không hoàn" },
];

/** Danh sách khoản cọc cần chuyển khoản lại cho khách — quá hạn lên đầu, tô đỏ. */
export default function AdminRefundsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("pending");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["admin", "bookings", "refunds", tab, page],
    queryFn: () => fetchBookings({ depositRefundStatus: tab, page, limit: PAGE_SIZE }),
  });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
  }

  const bookings = query.data?.data ?? [];
  const overdueCount = tab === "pending" ? bookings.filter((b) => isRefundOverdue(b)).length : 0;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4">
          <div role="tablist" aria-label="Trạng thái hoàn cọc" className="flex gap-1.5">
            {TABS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={tab === item.value}
                onClick={() => {
                  setTab(item.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  tab === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {overdueCount > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive">
              <AlertTriangle className="size-3.5" />
              {overdueCount} khoản quá hạn hoàn cọc
            </span>
          )}
        </div>

        {query.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách hoàn cọc.</p>
            <Button onClick={() => query.refetch()}>Thử lại</Button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Banknote className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {tab === "pending" ? "Không có khoản cọc nào đang chờ hoàn." : "Chưa có đơn nào."}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách thuê</TableHead>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Số tiền hoàn</TableHead>
                  <TableHead>{tab === "refunded" ? "Đã hoàn lúc" : "Hạn hoàn"}</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => {
                  const overdue = isRefundOverdue(booking);
                  const statusMeta = DEPOSIT_REFUND_STATUS_LABEL[booking.depositRefundStatus ?? "none"];
                  return (
                    <TableRow key={booking.id} className={overdue ? "bg-destructive/5" : undefined}>
                      <TableCell>
                        <p className="font-medium">{booking.user?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{booking.user?.phone ?? ""}</p>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">{booking.device?.name ?? "Thiết bị"}</TableCell>
                      <TableCell className="font-semibold tabular-nums">
                        {formatVnd(booking.depositRefundAmount ?? 0)}
                      </TableCell>
                      <TableCell className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {tab === "refunded"
                          ? booking.depositRefundedAt && formatDateTimeVi(booking.depositRefundedAt)
                          : booking.depositRefundDueAt
                            ? formatDateTimeVi(booking.depositRefundDueAt)
                            : "—"}
                        {overdue && <span className="block">Quá hạn</span>}
                        {tab === "refunded" && booking.depositRefundTxnRef && (
                          <span className="block">Mã GD: {booking.depositRefundTxnRef}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusMeta.className)}>
                          {statusMeta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <BookingDetailDialog booking={booking} />
                          {booking.depositRefundStatus === "pending" && (
                            <DepositRefundDialog booking={booking} onChanged={handleChanged} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <AdminPagination
              page={page}
              totalPages={query.data?.meta.totalPages ?? 1}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
