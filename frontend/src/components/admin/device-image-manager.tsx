"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Package, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageDropzone } from "@/components/admin/image-dropzone";
import { updateDevice, uploadDeviceImages } from "@/lib/admin-api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Device } from "@/lib/devices-api";

export function DeviceImageManager({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  // Ảnh ĐÃ CÓ đang chờ xác nhận xoá (index trong device.images) — hover hiện
  // nút thùng rác, bấm 1 lần chuyển ảnh đó thành overlay "Xoá ảnh này?", bấm
  // lần 2 mới thật sự xoá. Đủ chắc chắn cho 1-trong-nhiều-ảnh mà không cần
  // Dialog nặng như ConfirmDeleteDialog (dùng cho xoá cả thiết bị/user).
  const [confirmingIndex, setConfirmingIndex] = useState<number | null>(null);
  const previews = useMemo(
    () => pendingFiles.map((file) => URL.createObjectURL(file)),
    [pendingFiles],
  );

  // Object URL là tài nguyên ngoài React (bộ nhớ trình duyệt) — chỉ dọn dẹp ở
  // cleanup, KHÔNG setState ở đây (previews đã suy ra thẳng từ useMemo trên).
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const mutation = useMutation({
    mutationFn: () => uploadDeviceImages(device.id, pendingFiles),
    onSuccess: () => {
      toast.success("Đã tải ảnh lên");
      setPendingFiles([]);
      queryClient.invalidateQueries({ queryKey: ["admin", "device", device.id] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể tải ảnh lên, vui lòng thử lại"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (index: number) =>
      updateDevice(device.id, {
        images: device.images.filter((_, i) => i !== index),
      }),
    onSuccess: () => {
      toast.success("Đã xoá ảnh");
      queryClient.invalidateQueries({ queryKey: ["admin", "device", device.id] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể xoá ảnh, vui lòng thử lại"));
    },
    onSettled: () => setConfirmingIndex(null),
  });

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground">Ảnh hiện có</p>
        {device.images.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Chưa có ảnh nào.</p>
        ) : (
          <div className="mt-2 grid grid-cols-4 gap-3 sm:grid-cols-5">
            {device.images.map((src, index) => {
              const isConfirming = confirmingIndex === index;
              return (
                <div
                  key={src}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted transition-shadow hover:shadow-md"
                >
                  <Image
                    src={src}
                    alt={`Ảnh ${index + 1}`}
                    fill
                    sizes="120px"
                    className="object-cover transition-transform duration-200 group-hover:scale-105"
                  />

                  {isConfirming ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 p-1 text-center">
                      <p className="text-[10px] leading-tight text-white">Xoá ảnh này?</p>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(index)}
                          disabled={deleteMutation.isPending}
                          aria-label="Xác nhận xoá"
                          className="rounded-full bg-destructive p-1 text-destructive-foreground disabled:opacity-60"
                        >
                          {deleteMutation.isPending && deleteMutation.variables === index ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Check className="size-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingIndex(null)}
                          aria-label="Huỷ xoá"
                          className="rounded-full bg-white/20 p-1 text-white"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingIndex(index)}
                      aria-label="Xoá ảnh này"
                      className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Thêm ảnh mới</p>
        <ImageDropzone
          onFilesSelected={handleFilesSelected}
          hint="Tối đa 8 ảnh, mỗi ảnh không quá 5MB"
          className="mt-2"
        />

        {previews.length > 0 && (
          <>
            <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-5">
              {previews.map((src, index) => (
                <div
                  key={src}
                  className="group relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL xem trước cục bộ, next/image chỉ nhận domain đã whitelist (res.cloudinary.com) */}
                  <img
                    src={src}
                    alt={`Xem trước ${index + 1}`}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePendingFile(index)}
                    aria-label="Bỏ ảnh này"
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              className="mt-3"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Package />
              )}
              Tải {previews.length} ảnh lên
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
