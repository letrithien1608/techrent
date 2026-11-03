"use client";

import Image from "next/image";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FormErrorBanner } from "@/components/form-error-banner";
import { PhotoPicker } from "@/components/admin/photo-picker";
import { IssueMedia } from "@/components/bookings/issue-events";
import {
  fetchReplacementCandidates,
  resolveIssue,
  type IssueReportWithBooking,
  type IssueResolution,
} from "@/lib/bookings-api";
import { ISSUE_RESOLUTION_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

const HINTS: Record<IssueResolution, string> = {
  swapped: "Lỗi do thiết bị — đổi sang máy cùng danh mục, giá trị tương đương, trống lịch. Thời hạn thuê giữ nguyên.",
  ended_early: "Lỗi do thiết bị — kết thúc đơn ngay, hoàn tiền thuê phần chưa dùng và hoàn đủ tiền cọc.",
  customer_fault: "Lỗi do người thuê — ghi chi phí sửa, tự trừ vào tiền cọc khi khách trả máy.",
};

/** Nhân viên xử lý 1 báo lỗi thiết bị — điều khiển mở/đóng từ trang /admin/issues. */
export function ResolveIssueDialog({
  report,
  open,
  onOpenChange,
  onResolved,
}: {
  report: IssueReportWithBooking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}) {
  const [resolution, setResolution] = useState<IssueResolution>("swapped");
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [repairInput, setRepairInput] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const booking = report.booking;

  const candidatesQuery = useQuery({
    queryKey: ["admin", "replacement-candidates", booking.id],
    queryFn: () => fetchReplacementCandidates(booking.id),
    enabled: open && resolution === "swapped",
  });
  const repairCost = Number(repairInput.replace(/\D/g, "")) || 0;

  const mutation = useMutation({
    mutationFn: () =>
      resolveIssue(report.id, {
        resolution,
        replacementDeviceId: resolution === "swapped" ? (replacementId ?? undefined) : undefined,
        repairCost: resolution === "customer_fault" ? repairCost : undefined,
        note: note.trim() || undefined,
        files: resolution === "swapped" ? files : [],
      }),
    onSuccess: () => {
      toast.success("Đã xử lý báo lỗi — khách đã nhận thông báo");
      onOpenChange(false);
      onResolved();
    },
    onError: (err) => setError(getErrorMessage(err, "Không xử lý được báo lỗi")),
  });

  function submit() {
    setError(null);
    if (resolution === "swapped" && !replacementId) return setError("Vui lòng chọn máy thay thế");
    if (resolution === "customer_fault" && repairCost <= 0) return setError("Vui lòng nhập chi phí sửa chữa");
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Xử lý báo lỗi – {booking.device?.name}</DialogTitle>
          <DialogDescription>
            {booking.user?.name} · gửi lúc {formatDateTimeVi(report.createdAt)} · hạn trả{" "}
            {formatDateTimeVi(booking.endTime)}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
          <p>{report.description}</p>
          <IssueMedia media={report.media} />
        </div>

        <div role="radiogroup" aria-label="Hướng xử lý" className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(ISSUE_RESOLUTION_LABEL) as IssueResolution[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={resolution === value}
              onClick={() => setResolution(value)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors",
                resolution === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {ISSUE_RESOLUTION_LABEL[value]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{HINTS[resolution]}</p>

        {resolution === "swapped" && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Chọn máy thay thế</h3>
            {candidatesQuery.isPending ? (
              <Skeleton className="h-20 rounded-xl" />
            ) : candidatesQuery.isError ? (
              <p className="text-sm text-destructive">Không tải được danh sách máy thay thế.</p>
            ) : candidatesQuery.data.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
                Không có máy tương đương còn trống lịch — hãy chọn &quot;Kết thúc sớm, hoàn tiền&quot;.
              </p>
            ) : (
              <div role="radiogroup" aria-label="Máy thay thế" className="grid gap-2 sm:grid-cols-2">
                {candidatesQuery.data.map((device) => (
                  <button
                    key={device.id}
                    type="button"
                    role="radio"
                    aria-checked={replacementId === device.id}
                    onClick={() => setReplacementId(device.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-2 text-left transition-colors",
                      replacementId === device.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/30",
                    )}
                  >
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {device.images[0] && (
                        <Image src={device.images[0]} alt={device.name} fill sizes="48px" className="object-cover" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{device.name}</p>
                      <p className="text-xs text-muted-foreground">Giá trị {formatVnd(device.originalPrice)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">Biên bản giao máy thay thế</h3>
              <PhotoPicker
                files={files}
                onChange={setFiles}
                hint="Chụp tối thiểu 3 ảnh tình trạng máy thay thế khi giao cho khách"
              />
            </div>
          </div>
        )}

        {resolution === "customer_fault" && (
          <div>
            <Label htmlFor="repair-cost" className="mb-1.5 block">
              Chi phí sửa chữa (đ)
            </Label>
            <Input
              id="repair-cost"
              inputMode="numeric"
              value={repairInput ? Number(repairInput.replace(/\D/g, "") || 0).toLocaleString("vi-VN") : ""}
              onChange={(e) => setRepairInput(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
            />
          </div>
        )}

        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="Ghi chú gửi kèm thông báo cho khách (không bắt buộc)"
        />
        {error && <FormErrorBanner message={error} />}
        <Button size="lg" className="w-full" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending ? <Loader2 className="animate-spin" /> : <Wrench />}
          Xác nhận xử lý
        </Button>
      </DialogContent>
    </Dialog>
  );
}
