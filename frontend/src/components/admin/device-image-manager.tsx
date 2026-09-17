"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Package, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadDeviceImages } from "@/lib/admin-api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Device } from "@/lib/devices-api";

export function DeviceImageManager({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
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

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">Ảnh hiện có</p>
        {device.images.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Chưa có ảnh nào.</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-3">
            {device.images.map((src, index) => (
              <div
                key={src}
                className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted"
              >
                <Image src={src} alt={`Ảnh ${index + 1}`} fill sizes="80px" className="object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">Thêm ảnh mới</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus /> Chọn ảnh
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {previews.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Chưa chọn ảnh nào — tối đa 8 ảnh, mỗi ảnh không quá 5MB.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-3">
              {previews.map((src, index) => (
                <div
                  key={src}
                  className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted"
                >
                  <Image src={src} alt={`Xem trước ${index + 1}`} fill sizes="80px" className="object-cover" />
                  <button
                    type="button"
                    onClick={() => removePendingFile(index)}
                    aria-label="Bỏ ảnh này"
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
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
