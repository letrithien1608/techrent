"use client";

import { cn } from "cn";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList, Loader2, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
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
import {
  AdminFilterPanel,
  AdminSearchInput,
  FilterSwitch,
  HighlightText,
  NoResults,
  ResultSummary,
} from "@/components/admin/admin-list-filters";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { BookingDetailDialog } from "@/components/admin/booking-detail-dialog";
import { BookingHandoverDialog } from "@/components/admin/booking-handover-dialog";
import { BookingReturnDialog } from "@/components/admin/booking-return-dialog";
import { DepositRefundDialog } from "@/components/admin/deposit-refund-dialog";
import { ConfirmLostDialog } from "@/components/admin/confirm-lost-dialog";
import { useAuthStore } from "@/stores/auth-store";
import { CancelBookingDialog } from "@/components/bookings/cancel-booking-dialog";
import {
  confirmBooking,
  fetchBookingById,
  runOverdueCheck,
  searchAdminBookings,
  type BookingSearchSort,
  type BookingStatus,
  type DepositRefundStatus,
} from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL, DEPOSIT_REFUND_STATUS_LABEL } from "@/lib/booking-format";
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
  { value: "lost", label: "Mất thiết bị" },
];

const REFUND_FILTERS: { value: DepositRefundStatus | "all"; label: string }[] = [
  { value: "all", label: "Mọi trạng thái cọc" },
  ...(Object.keys(DEPOSIT_REFUND_STATUS_LABEL) as DepositRefundStatus[]).map((value) => ({
    value,
    label: DEPOSIT_REFUND_STATUS_LABEL[value].label,
  })),
];

const SORTS: { value: BookingSearchSort; label: string }[] = [
  { value: "newest", label: "Mới tạo nhất" },
  { value: "pickup", label: "Ngày nhận máy gần nhất" },
  { value: "value", label: "Giá trị cao nhất" },
];

// Tham số trên URL. `demo=show` = hiện đơn dữ liệu mẫu (mặc định ẩn).
const FILTER_KEYS = ["q", "status", "refund", "from", "to", "debt", "lost", "demo", "sort"] as const;

const bookingCode = (id: string) => `#${id.slice(0, 8).toUpperCase()}`;

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
        if (!next) {
          // Chỉ bỏ ?bookingId=, giữ nguyên bộ lọc đang dùng.
          const params = new URLSearchParams(window.location.search);
          params.delete("bookingId");
          const query = params.toString();
          router.replace(query ? `/admin/bookings?${query}` : "/admin/bookings", { scroll: false });
        }
      }}
    />
  );
}

function AdminBookingsContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const focusBookingId = searchParams.get("bookingId");
  const filters = useUrlFilters(FILTER_KEYS);
  const { values: f, page } = filters;
  const status = FILTERS.some((item) => item.value === f.status) ? (f.status as BookingStatus) : "all";
  const refund = REFUND_FILTERS.some((item) => item.value === f.refund)
    ? (f.refund as DepositRefundStatus)
    : "all";
  const sort = SORTS.some((item) => item.value === f.sort) ? (f.sort as BookingSearchSort) : "newest";
  const showDemo = f.demo === "show";
  // Chỉ đổi cách sắp xếp thì không tính là đang lọc.
  const isFiltered = filters.activeCount - (f.sort ? 1 : 0) > 0;

  const clearFilters = filters.clear;

  const bookingsQuery = useQuery({
    queryKey: ["admin", "bookings", "search", page, f],
    queryFn: () =>
      searchAdminBookings({
        page,
        limit: PAGE_SIZE,
        q: f.q || undefined,
        status: status === "all" ? undefined : status,
        depositRefundStatus: refund === "all" ? undefined : refund,
        from: f.from || undefined,
        to: f.to || undefined,
        hasDebt: f.debt === "1" || undefined,
        suspectedLost: f.lost === "1" || undefined,
        hideDemo: !showDemo,
        sort,
      }),
  });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
  }

  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const overdueMutation = useMutation({
    mutationFn: runOverdueCheck,
    onSuccess: ({ flagged }) => {
      toast.success(flagged ? `Đã đánh dấu ${flagged} đơn nghi mất thiết bị` : "Không có đơn mới quá hạn từ 7 ngày");
      handleChanged();
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không chạy được kiểm tra quá hạn")),
  });

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
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-4">
          <AdminSearchInput
            value={f.q}
            onSearch={(q) => filters.update({ q })}
            placeholder="Mã đơn, tên, email, SĐT khách, thiết bị, serial..."
            className="min-w-0 flex-1 basis-60"
          />
          <AdminFilterPanel
            activeCount={filters.activeCount - (f.q ? 1 : 0)}
            onClear={clearFilters}
          >
            <Select
              value={status}
              onValueChange={(value) => filters.update({ status: value === "all" ? null : value })}
            >
              <SelectTrigger className="h-9 w-40" aria-label="Trạng thái đơn">
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
            <Select
              value={refund}
              onValueChange={(value) => filters.update({ refund: value === "all" ? null : value })}
            >
              <SelectTrigger className="h-9 w-48" aria-label="Trạng thái hoàn cọc">
                <SelectValue>
                  {(value: string) => REFUND_FILTERS.find((item) => item.value === value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REFUND_FILTERS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span className="shrink-0">Thuê từ</span>
              <Input
                type="date"
                value={f.from}
                max={f.to || undefined}
                aria-label="Từ ngày"
                onChange={(event) => filters.update({ from: event.target.value })}
                className="h-9 w-[9.5rem]"
              />
              <span className="shrink-0">đến</span>
              <Input
                type="date"
                value={f.to}
                min={f.from || undefined}
                aria-label="Đến ngày"
                onChange={(event) => filters.update({ to: event.target.value })}
                className="h-9 w-[9.5rem]"
              />
            </div>
            <FilterSwitch
              label="Chỉ đơn còn nợ"
              checked={f.debt === "1"}
              onCheckedChange={(checked) => filters.update({ debt: checked ? "1" : null })}
            />
            <FilterSwitch
              label="Chỉ đơn nghi mất"
              checked={f.lost === "1"}
              onCheckedChange={(checked) => filters.update({ lost: checked ? "1" : null })}
            />
            <FilterSwitch
              label="Ẩn đơn dữ liệu mẫu"
              checked={!showDemo}
              onCheckedChange={(checked) => filters.update({ demo: checked ? null : "show" })}
            />
            <Select
              value={sort}
              onValueChange={(value) => filters.update({ sort: value === "newest" ? null : value })}
            >
              <SelectTrigger className="h-9 w-72" aria-label="Sắp xếp">
                <SelectValue>
                  {(value: string) => `Sắp xếp: ${SORTS.find((item) => item.value === value)?.label}`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminFilterPanel>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={overdueMutation.isPending}
              onClick={() => overdueMutation.mutate()}
            >
              {overdueMutation.isPending && <Loader2 className="animate-spin" />}
              Kiểm tra đơn quá hạn ngay
            </Button>
          )}
        </div>

        <ResultSummary
          total={meta?.total}
          unit="đơn"
          loading={bookingsQuery.isPending}
          filtered={isFiltered}
          onClear={clearFilters}
        />

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
          isFiltered ? (
            <NoResults message="Không có đơn thuê nào khớp từ khoá và bộ lọc." onClear={clearFilters} />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <ClipboardList className="size-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">Không có đơn thuê nào.</p>
            </div>
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đơn / thiết bị</TableHead>
                  <TableHead>Khách</TableHead>
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
                      <TableCell className="max-w-[220px]">
                        <p className="font-mono text-xs text-muted-foreground">
                          <HighlightText text={bookingCode(booking.id)} query={f.q} />
                          {booking.isDemo && (
                            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 font-sans text-[10px]">
                              Dữ liệu mẫu
                            </span>
                          )}
                        </p>
                        <p className="truncate font-medium">
                          <HighlightText text={booking.device?.name ?? "Thiết bị"} query={f.q} />
                        </p>
                        {booking.device?.serialNumber && (
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            SN <HighlightText text={booking.device.serialNumber} query={f.q} />
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {booking.user && (
                          <>
                            <p className="truncate font-medium">
                              <HighlightText text={booking.user.name} query={f.q} />
                            </p>
                            {booking.user.phone && (
                              <p className="truncate text-xs text-muted-foreground">
                                <HighlightText text={booking.user.phone} query={f.q} />
                              </p>
                            )}
                            {booking.user.email && (
                              <p className="truncate text-xs text-muted-foreground">
                                <HighlightText text={booking.user.email} query={f.q} />
                              </p>
                            )}
                          </>
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
                        {booking.status === "ongoing" && booking.suspectedLostAt && (
                          <span className="ml-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                            Nghi mất
                          </span>
                        )}
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
                          {isAdmin && booking.status === "ongoing" && booking.suspectedLostAt && (
                            <Tooltip>
                              <TooltipTrigger render={<span className="inline-flex" />}>
                                <ConfirmLostDialog booking={booking} onChanged={handleChanged} />
                              </TooltipTrigger>
                              <TooltipContent>Xác nhận mất thiết bị</TooltipContent>
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
              onPageChange={filters.setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
