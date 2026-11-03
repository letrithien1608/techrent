"use client";

import { cn } from "cn";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KycImagesViewer } from "@/components/admin/kyc-images-viewer";
import { BookingStatusTimeline } from "@/components/bookings/booking-status-timeline";
import { DepositSettlementTable } from "@/components/bookings/deposit-settlement-table";
import { InspectionComparison } from "@/components/bookings/inspection-comparison";
import { IssueEvents } from "@/components/bookings/issue-events";
import { fetchBookingById, type Booking } from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi } from "@/lib/device-format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/**
 * Mặc định tự quản lý trạng thái mở bằng nút con mắt. Truyền `open`/`onOpenChange`
 * + `hideTrigger` để mở từ bên ngoài (VD bấm thông báo → /admin/bookings?bookingId=).
 */
export function BookingDetailDialog({
  booking,
  open,
  onOpenChange,
  hideTrigger = false,
}: {
  booking: Booking;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  // Tự quản lý trạng thái mở khi không được điều khiển từ ngoài — cần biết
  // đang mở để tải chi tiết đơn (biên bản giao/nhận máy) đúng lúc.
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const detailQuery = useQuery({
    queryKey: ["admin", "booking", booking.id],
    queryFn: () => fetchBookingById(booking.id),
    enabled: isOpen,
  });
  const detail = detailQuery.data ?? booking;
  const status = BOOKING_STATUS_LABEL[detail.status];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        setInnerOpen(next);
        onOpenChange?.(next);
      }}
    >
      {!hideTrigger && (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Xem chi tiết" />}>
          <Eye className="size-4" />
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{booking.device?.name ?? "Chi tiết đơn thuê"}</DialogTitle>
        </DialogHeader>
        <dl className="divide-y divide-border/60">
          <Row label="Mã đơn">
            <span className="font-mono text-xs">{booking.id}</span>
          </Row>
          <Row label="Trạng thái">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>
              {status.label}
            </span>
          </Row>
          {detail.user && (
            <Row label="Khách thuê">
              {detail.user.name}
              {detail.user.phone && <span className="text-muted-foreground"> · {detail.user.phone}</span>}
            </Row>
          )}
          <Row label="Bắt đầu">{formatDateTimeVi(detail.startTime)}</Row>
          <Row label="Kết thúc">{formatDateTimeVi(detail.endTime)}</Row>
          {detail.returnedAt && <Row label="Trả máy lúc">{formatDateTimeVi(detail.returnedAt)}</Row>}
          <Row label="Hợp đồng">{detail.contractSigned ? "Khách đã ký" : "Chưa ký"}</Row>
          <Row label="Tạo lúc">{formatDateTimeVi(detail.createdAt)}</Row>
        </dl>

        <div className="border-t border-border/60 pt-4">
          <BookingStatusTimeline booking={detail} />
        </div>
        {!!detail.issueReports?.length && (
          <div className="border-t border-border/60 pt-4">
            <h3 className="mb-2 text-sm font-semibold">Báo lỗi &amp; đổi máy</h3>
            <IssueEvents reports={detail.issueReports} />
          </div>
        )}
        <div className="border-t border-border/60 pt-4">
          <h3 className="mb-2 text-sm font-semibold">Tiền thuê &amp; tiền cọc</h3>
          <DepositSettlementTable booking={detail} />
        </div>
        {(detail.status === "ongoing" || detail.status === "completed" || detail.inspections?.length) && (
          <div className="border-t border-border/60 pt-4">
            <h3 className="mb-2 text-sm font-semibold">Biên bản giao / nhận máy</h3>
            <InspectionComparison
              inspections={detail.inspections}
              endedWithoutReturn={!!detail.issueReports?.some((r) => r.resolution === "ended_early")}
            />
          </div>
        )}

        {/* Xem hồ sơ eKYC của khách thuê — xác minh tranh chấp thật (ảnh mờ,
         * sai thông tin...). Không có tên khách sẵn trong `Booking` nên dùng
         * nhãn chung "Khách thuê" — KHÔNG gọi thêm API chỉ để lấy tên. */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href={`/admin/bookings/${booking.id}/contract`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            nativeButton={false}
          >
            <FileText className="size-4" />
            Xem/In hợp đồng
          </Button>
          <KycImagesViewer userId={booking.userId} userName="Khách thuê" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
