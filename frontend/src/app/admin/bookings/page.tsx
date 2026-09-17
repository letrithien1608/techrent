"use client";

import { cn } from "cn";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Loader2, PlayCircle, WifiOff } from "lucide-react";
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
import { AdminPagination } from "@/components/admin/admin-pagination";
import { BookingDetailDialog } from "@/components/admin/booking-detail-dialog";
import { CancelBookingDialog } from "@/components/bookings/cancel-booking-dialog";
import {
  completeBooking,
  confirmBooking,
  fetchBookings,
  startBooking,
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
  { value: "completed", label: "Hoàn tất" },
  { value: "cancelled", label: "Đã huỷ" },
];

export default function AdminBookingsPage() {
  const queryClient = useQueryClient();
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
    mutationFn: ({ id, action }: { id: string; action: "confirm" | "start" | "complete" }) =>
      action === "confirm"
        ? confirmBooking(id)
        : action === "start"
          ? startBooking(id)
          : completeBooking(id),
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
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value as BookingStatus | "all");
          setPage(1);
        }}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FILTERS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
        {bookingsQuery.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : bookingsQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách đơn thuê.</p>
            <Button onClick={() => bookingsQuery.refetch()}>Thử lại</Button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
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
                      <TableCell className="max-w-[180px] truncate font-medium">
                        {booking.device?.name ?? "Thiết bị"}
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
                          <BookingDetailDialog booking={booking} />
                          {booking.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isMutatingThis}
                              onClick={() =>
                                transitionMutation.mutate({ id: booking.id, action: "confirm" })
                              }
                            >
                              {isMutatingThis ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <CheckCircle2 />
                              )}
                              Xác nhận
                            </Button>
                          )}
                          {booking.status === "confirmed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isMutatingThis}
                              onClick={() =>
                                transitionMutation.mutate({ id: booking.id, action: "start" })
                              }
                            >
                              {isMutatingThis ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <PlayCircle />
                              )}
                              Bắt đầu
                            </Button>
                          )}
                          {booking.status === "ongoing" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isMutatingThis}
                              onClick={() =>
                                transitionMutation.mutate({ id: booking.id, action: "complete" })
                              }
                            >
                              {isMutatingThis ? (
                                <Loader2 className="animate-spin" />
                              ) : (
                                <CheckCircle2 />
                              )}
                              Hoàn tất
                            </Button>
                          )}
                          {(booking.status === "pending" || booking.status === "confirmed") && (
                            <CancelBookingDialog booking={booking} onCancelled={handleChanged} />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-3">
              <AdminPagination
                page={page}
                totalPages={meta?.totalPages ?? 1}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
