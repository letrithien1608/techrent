"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { downloadOwnContractPdf, fetchOwnContract } from "@/lib/bookings-api";
import { formatDateTimeVi } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";
import { contractPdfFilename, saveBlob } from "@/lib/save-blob";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Khách xem hợp đồng thuê của CHÍNH đơn mình — HTML hoàn chỉnh do backend
 * dựng (CCCD che), hiển thị trong iframe như trang hợp đồng của admin.
 */
export default function OwnContractPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(1200);

  useEffect(() => {
    if (hasHydrated && !user) {
      router.push(`/login?redirect=${encodeURIComponent(`/bookings/${params.id}/contract`)}`);
    }
  }, [hasHydrated, user, router, params.id]);

  const contractQuery = useQuery({
    queryKey: ["booking-contract", params.id],
    queryFn: () => fetchOwnContract(params.id),
    enabled: hasHydrated && !!user,
    retry: false,
  });

  const pdfMutation = useMutation({
    mutationFn: () => downloadOwnContractPdf(params.id),
    onSuccess: (blob) => saveBlob(blob, contractPdfFilename(params.id)),
    onError: (error) => toast.error(getErrorMessage(error, "Không tải được file PDF, vui lòng thử lại")),
  });

  function fitFrame() {
    const doc = frameRef.current?.contentDocument;
    if (doc) setFrameHeight(doc.documentElement.scrollHeight + 8);
  }

  if (!hasHydrated || !user) return null;

  const contract = contractQuery.data;

  return (
    <div className="mx-auto w-full max-w-[900px] flex-1 px-4 py-10 sm:px-6">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/bookings" className="transition-colors hover:text-foreground">
          Đơn của tôi
        </Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/bookings/${params.id}`} className="transition-colors hover:text-foreground">
          Chi tiết đơn
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">Hợp đồng</span>
      </nav>

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-xl font-semibold">Hợp đồng thuê tài sản</h1>
        {contract && (
          <div className="flex flex-wrap items-center gap-3">
            {contract.signed ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                <CheckCircle2 className="size-4" aria-hidden />
                Đã ký{contract.signedAt && ` · ${formatDateTimeVi(contract.signedAt)}`}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-medium text-amber-400">
                <Clock className="size-4" aria-hidden />
                Chưa ký
              </span>
            )}
            <Button size="sm" disabled={pdfMutation.isPending} onClick={() => pdfMutation.mutate()}>
              {pdfMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
              Tải PDF
            </Button>
          </div>
        )}
      </div>

      {contract && (
        <p className="mb-4 rounded-lg bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          Số CCCD được che bớt để bảo vệ thông tin cá nhân. Bản hợp đồng có giá trị là bản giấy hai bên ký tay tại
          cửa hàng.
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
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => contractQuery.refetch()}>
              Thử lại
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href={`/bookings/${params.id}`} />}>
              Về chi tiết đơn
            </Button>
          </div>
        </div>
      )}

      {contract && (
        <iframe
          ref={frameRef}
          title="Hợp đồng thuê tài sản"
          srcDoc={contract.html}
          // Không cho chạy script trong nội dung hợp đồng; same-origin để đo chiều cao.
          sandbox="allow-same-origin"
          onLoad={fitFrame}
          style={{ height: frameHeight }}
          className="w-full rounded-xl border border-border/60 bg-[#e5e7eb]"
        />
      )}
    </div>
  );
}
