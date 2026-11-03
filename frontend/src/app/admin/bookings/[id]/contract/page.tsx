"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileDown, Info, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  downloadContractPdf,
  fetchContractForPrint,
  setContractSigned,
} from "@/lib/bookings-api";
import { formatDateTimeVi } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * Xem/In/Tải PDF hợp đồng thuê (staff/admin). Hợp đồng là trang HTML hoàn
 * chỉnh do backend dựng (font tiếng Việt nhúng sẵn, CSS in A4) — hiển thị
 * trong iframe nên khi in chỉ in đúng nội dung hợp đồng, không dính menu,
 * nút hay khung chat của trang quản trị.
 */
export default function BookingContractPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(1200);

  const contractQuery = useQuery({
    queryKey: ["admin", "booking-contract", params.id],
    queryFn: () => fetchContractForPrint(params.id),
    retry: false,
  });

  const signedMutation = useMutation({
    mutationFn: (signed: boolean) => setContractSigned(params.id, signed),
    onSuccess: (_, signed) => {
      toast.success(signed ? "Đã đánh dấu đã ký hợp đồng" : "Đã bỏ đánh dấu ký");
      queryClient.invalidateQueries({ queryKey: ["admin", "booking-contract", params.id] });
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể cập nhật trạng thái ký")),
  });

  const pdfMutation = useMutation({
    mutationFn: () => downloadContractPdf(params.id),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hop-dong-${params.id.slice(0, 8).toUpperCase()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không tạo được file PDF, vui lòng dùng nút In")),
  });

  function fitFrame() {
    const doc = frameRef.current?.contentDocument;
    if (doc) setFrameHeight(doc.documentElement.scrollHeight + 8);
  }

  return (
    <div className="mx-auto max-w-[900px] pb-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/admin/bookings?bookingId=${params.id}`} />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Quay lại chi tiết đơn
        </Button>

        {contractQuery.data && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2.5 rounded-full border border-border/60 py-1.5 pl-3 pr-4 text-sm font-medium">
              <Switch
                checked={contractQuery.data.signed}
                onCheckedChange={(checked) => signedMutation.mutate(checked)}
                disabled={signedMutation.isPending}
              />
              Đã ký tay
            </label>
            <Button variant="outline" size="sm" onClick={() => frameRef.current?.contentWindow?.print()}>
              <Printer className="size-4" />
              In
            </Button>
            <Button size="sm" disabled={pdfMutation.isPending} onClick={() => pdfMutation.mutate()}>
              {pdfMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
              Tải PDF
            </Button>
          </div>
        )}
      </div>

      {contractQuery.data && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Khi bấm In, hãy tắt mục &quot;Headers and footers&quot; (Đầu trang và chân trang) trong hộp thoại in để không in
          kèm ngày giờ, đường dẫn. File &quot;Tải PDF&quot; đã sạch sẵn, khổ A4.
          {contractQuery.data.signed &&
            contractQuery.data.signedAt &&
            ` · Đã ký tay lúc ${formatDateTimeVi(contractQuery.data.signedAt)}.`}
        </p>
      )}

      {contractQuery.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-[800px] w-full" />
        </div>
      )}

      {contractQuery.isError && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/60 py-16 text-center">
          <AlertTriangle className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {getErrorMessage(contractQuery.error, "Không thể tải hợp đồng")}
          </p>
          <Button variant="outline" size="sm" onClick={() => contractQuery.refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {contractQuery.data && (
        <iframe
          ref={frameRef}
          title="Hợp đồng thuê tài sản"
          srcDoc={contractQuery.data.html}
          // Không cho chạy script trong nội dung hợp đồng; same-origin để in/đo chiều cao.
          sandbox="allow-same-origin allow-modals"
          onLoad={fitFrame}
          style={{ height: frameHeight }}
          className="w-full rounded-xl border border-border/60 bg-[#e5e7eb]"
        />
      )}
    </div>
  );
}
