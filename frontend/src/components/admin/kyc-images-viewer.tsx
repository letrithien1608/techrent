"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, IdCard, Loader2, RotateCcw, ScanFace } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { fetchKycImages, resetKycImages } from "@/lib/admin-api";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * Dialog xem ảnh eKYC (CCCD mặt trước/sau + ảnh chân dung) — admin-only, xác
 * minh tranh chấp thật. Dùng chung ở `UserFormDialog` (trang chi tiết user)
 * VÀ `BookingDetailDialog` (trang chi tiết booking) — chỉ cần `userId`.
 *
 * Mỗi URL ảnh chỉ sống `expiresInSeconds` (5 phút, sinh MỚI mỗi lần gọi API)
 * — `staleTime: 0` để React Query LUÔN gọi lại API khi dialog mở lại (không
 * dùng URL cũ đã/sắp hết hạn từ cache).
 */
export function KycImagesViewer({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "kyc-images", userId],
    queryFn: () => fetchKycImages(userId),
    enabled: open,
    staleTime: 0,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ScanFace className="size-4" />
        Xem hồ sơ KYC
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Hồ sơ xác thực danh tính — {userName}</DialogTitle>
        </DialogHeader>

        {query.isPending && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Đang tải...
          </div>
        )}

        {query.isError && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="size-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {getErrorMessage(query.error, "Không thể tải hồ sơ KYC")}
            </p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Thử lại
            </Button>
          </div>
        )}

        {query.data && !query.data.submitted && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <IdCard className="size-8" />
            Người dùng này chưa nộp đủ hồ sơ xác thực danh tính.
          </div>
        )}

        {query.data && query.data.submitted && (
          <>
            <p className="text-xs text-muted-foreground">
              Ảnh có hạn xem {Math.round(query.data.expiresInSeconds / 60)} phút
              kể từ lúc tải — đóng rồi mở lại dialog để lấy link mới nếu hết hạn.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {query.data.images.map((image) => (
                <div key={image.slot} className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    {image.label}
                  </p>
                  {/* URL ký ngắn hạn từ Cloudinary — KHÔNG dùng next/image vì
                   * (1) hostname khác domain đã whitelist (api.cloudinary.com,
                   * không phải res.cloudinary.com), (2) URL đổi mỗi lần gọi nên
                   * không có giá trị cache/optimize, (3) nếu Next tự refetch để
                   * tối ưu SAU KHI hết hạn sẽ nhận 401. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.label}
                    className="aspect-[4/3] w-full rounded-lg border border-border/60 object-cover"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <ConfirmDeleteDialog
                title="Reset hồ sơ KYC?"
                description="Xoá cả 3 ảnh hiện tại (cả trên Cloudinary) để người dùng tự nộp lại — dùng khi ảnh mờ/sai/không hợp lệ."
                triggerVariant="outline"
                triggerSize="sm"
                successMessage="Đã reset hồ sơ KYC — người dùng có thể nộp lại"
                onConfirm={() => resetKycImages(userId)}
                onDeleted={() => setOpen(false)}
              >
                <RotateCcw className="size-4" />
                Yêu cầu nộp lại
              </ConfirmDeleteDialog>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
