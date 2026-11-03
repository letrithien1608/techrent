"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileDown, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type Booking, downloadOwnContractPdf } from "@/lib/bookings-api";
import { formatDateTimeVi } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";
import { contractPdfFilename, saveBlob } from "@/lib/save-blob";

/**
 * Hợp đồng thuê của chính đơn khách (từ khi đơn đã xác nhận): trạng thái ký
 * tay tại cửa hàng + xem/tải PDF. Bản khách xem có CCCD che.
 */
export function BookingContractCard({ booking }: { booking: Booking }) {
  const pdfMutation = useMutation({
    mutationFn: () => downloadOwnContractPdf(booking.id),
    onSuccess: (blob) => saveBlob(blob, contractPdfFilename(booking.id)),
    onError: (error) => toast.error(getErrorMessage(error, "Không tải được file PDF, vui lòng thử lại")),
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="text-sm">
          {booking.contractSigned ? (
            <p className="flex items-center gap-1.5 font-medium text-emerald-400">
              <CheckCircle2 className="size-4" aria-hidden />
              Đã ký
              {booking.contractSignedAt && (
                <span className="font-normal text-muted-foreground">
                  · {formatDateTimeVi(booking.contractSignedAt)}
                </span>
              )}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 font-medium text-amber-400">
              <Clock className="size-4" aria-hidden />
              Chưa ký
            </p>
          )}
          <p className="mt-1 text-muted-foreground">
            {booking.contractSigned
              ? "Hợp đồng đã được hai bên ký tay tại cửa hàng."
              : "Bạn sẽ ký tay hợp đồng khi nhận máy tại cửa hàng. Có thể đọc trước nội dung."}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/bookings/${booking.id}/contract`} />}
          nativeButton={false}
        >
          <FileText className="size-4" />
          Xem hợp đồng
        </Button>
        <Button size="sm" disabled={pdfMutation.isPending} onClick={() => pdfMutation.mutate()}>
          {pdfMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
          Tải PDF
        </Button>
      </div>
    </div>
  );
}
