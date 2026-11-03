"use client";

import { cn } from "cn";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Loader2, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { BookingDetailDialog } from "@/components/admin/booking-detail-dialog";
import { BookingHandoverDialog } from "@/components/admin/booking-handover-dialog";
import { BookingReturnDialog } from "@/components/admin/booking-return-dialog";
import { DepositRefundDialog } from "@/components/admin/deposit-refund-dialog";
import { CancelBookingDialog } from "@/components/bookings/cancel-booking-dialog";
import {
  confirmBooking,
  fetchBookingById,
  fetchBookings,
  type BookingStatus,
} from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

const PAGE_SIZE = 10;

const FILTERS: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Chờ thanh toán" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "ongoing", label: "Đang thuê" },
  { value: "completed", label: "Đã trả máy" },
  { value: "cancelled", label: "Đã huỷ" },
];

export default function AdminBookingsPage() {
  // useSearchParams() bắt buộc nằm trong <Suspense> (quy tắc mục 2 CLAUDE.md).
  return (
    <Suspense fallback={null}>
      <AdminBookingsContent />
    </Suspense>
  );
}

/** Mở sẵn chi tiết 1 đơn khi đi từ thông báo (`?bookingId=`), kể cả đơn không nằm ở trang hiện tại. */
function FocusedBookingDialog({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const query = useQuery({
    queryKey: ["admin", "booking", bookingId],
    queryFn: () => fetchBookingById(bookingId),
  });
  if (!query.data) return null;
  return (
    <BookingDetailDialog
      booking={query.data}
      hideTrigger
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.replace("/admin/bookings");
      }}
    />
  );
}

function AdminBookingsContent() {
  const queryClient = useQueryClient();
  const focusBookingId = useSearchParams().get("bookingId");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BookingStatus | "all">("all");

  const bookingsQuery = useQuery({
    queryKey: ["admin", "bookings", page, status],
    queryFn: () =>
      fetchBookings({
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
      }),
  });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
  }

  const transitionMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => confirmBooking(id),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái đơn thuê");
      handleChanged();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể cập nhật trạng thái, vui lòng thử lại"));
    },
  });

  const bookings = bookingsQuery.data?.data ?? [];
  const meta = bookingsQuery.data?.meta;

  return (
    <div className="space-y-4">
      {focusBookingId && <FocusedBookingDialog key={focusBookingId} bookingId={focusBookingId} />}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
        <div className="border-b border-border/60 p-4">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as BookingStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue>
                {(value: string) => FILTERS.find((item) => item.value === value)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {bookingsQuery.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : bookingsQuery.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách đơn thuê.</p>
            <Button onClick={() => bookingsQuery.refetch()}>Thử lại</Button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ClipboardList className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Không có đơn thuê nào.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Giá trị</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((booking) => {
                  const statusMeta = BOOKING_STATUS_LABEL[booking.status];
                  const isMutatingThis =
                    transitionMutation.isPending &&
                    transitionMutation.variables?.id === booking.id;
                  return (
                    <TableRow key={booking.id}>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate font-medium">{booking.device?.name ?? "Thiết bị"}</p>
                        {booking.user && (
                          <p className="truncate text-xs text-muted-foreground">{booking.user.name}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTimeVi(booking.startTime)}
                        <br />→ {formatDateTimeVi(booking.endTime)}
                      </TableCell>
                      <TableCell>{formatVnd(booking.totalPrice)}</TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            statusMeta.className,
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger render={<span className="inline-flex" />}>
                              <BookingDetailDialog booking={booking} />
                            </TooltipTrigger>
                            <TooltipContent>Xem chi tiết</TooltipContent>
                          </Tooltip>
                          {booking.status === "pending" && (
                            <Tooltip>
                              <TooltipTrigger render={<span className="inline-flex" />}>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={isMutatingThis}
                                  aria-label="Xác nhận đơn"
                                  onClick={() => transitionMutation.mutate({ id: booking.id })}
                                >
                                  {isMutatingThis ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="size-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Xác nhận đơn</TooltipContent>
                            </Tooltip>
                          )}
                          {booking.status === "confirmed" && (
                            <Tooltip>
                              <TooltipTrigger render={<span className="inline-flex" />}>
                                <BookingHandoverDialog booking={booking} onChanged={handleChanged} />
                              </TooltipTrigger>
                              <TooltipContent>Giao máy (biên bản, thu tiền thuê, ký hợp đồng)</TooltipContent>
                            </Tooltip>
                          )}
                          {booking.status === "ongoing" && (
                            <Tooltip>
                              <TooltipTrigger render={<span className="inline-flex" />}>
                                <BookingReturnDialog booking={booking} onChanged={handleChanged} />
                              </TooltipTrigger>
                              <TooltipContent>Xác nhận trả máy</TooltipContent>
                            </Tooltip>
                          )}
                          {booking.depositRefundStatus === "pending" && (
                            <Tooltip>
                              <TooltipTrigger render={<span className="inline-flex" />}>
                                <DepositRefundDialog booking={booking} onChanged={handleChanged} iconOnly />
                              </TooltipTrigger>
                              <TooltipContent>Đã hoàn cọc</TooltipContent>
                            </Tooltip>
                          )}
                          {(booking.status === "pending" ||
                            booking.status === "confirmed" ||
                            booking.status === "ongoing") && (
                            <CancelBookingDialog
                              booking={booking}
                              onCancelled={handleChanged}
                              iconOnly
                            />
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
              totalPages={meta?.totalPages ?? 1}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
