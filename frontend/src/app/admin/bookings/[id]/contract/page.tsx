"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  fetchContractForPrint,
  setContractSigned,
} from "@/lib/bookings-api";
import { formatDateTimeVi } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

export default function BookingContractPage() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const contractQuery = useQuery({
    queryKey: ["admin", "booking-contract", params.id],
    queryFn: () => fetchContractForPrint(params.id),
    retry: false,
  });

  const signedMutation = useMutation({
    mutationFn: (signed: boolean) => setContractSigned(params.id, signed),
    onSuccess: (_, signed) => {
      toast.success(signed ? "Đã đánh dấu đã ký hợp đồng" : "Đã bỏ đánh dấu ký");
      queryClient.invalidateQueries({
        queryKey: ["admin", "booking-contract", params.id],
      });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể cập nhật trạng thái ký"));
    },
  });

  return (
    <div className="mx-auto max-w-3xl pb-16">
      {/* Thanh công cụ — ẩn hoàn toàn khi in (`print:hidden`), chỉ hiện trên màn hình */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/admin/bookings" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Quay lại danh sách đơn
        </Button>

        {contractQuery.data && (
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2.5 rounded-full border border-border/60 py-1.5 pl-3 pr-4 text-sm font-medium text-foreground">
              <Switch
                checked={contractQuery.data.signed}
                onCheckedChange={(checked) => signedMutation.mutate(checked)}
                disabled={signedMutation.isPending}
              />
              Đã ký tay
            </label>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-4" />
              In hợp đồng
            </Button>
          </div>
        )}
      </div>

      {contractQuery.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-96 w-full" />
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
        <>
          {contractQuery.data.signed && (
            <p className="mb-4 rounded-lg bg-primary/10 px-4 py-2 text-sm text-primary print:hidden">
              Đã đánh dấu ký tay{" "}
              {contractQuery.data.signedAt &&
                `lúc ${formatDateTimeVi(contractQuery.data.signedAt)}`}
            </p>
          )}
          <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm print:rounded-none print:border-none print:p-0 print:shadow-none">
            <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground print:text-black">
              {contractQuery.data.content}
            </pre>
          </div>
        </>
      )}

      {signedMutation.isPending && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm shadow-lg print:hidden">
          <Loader2 className="size-4 animate-spin" />
          Đang lưu...
        </div>
      )}
    </div>
  );
}
