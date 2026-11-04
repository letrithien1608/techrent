"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical, Loader2, RotateCcw, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { revalidateDevices } from "@/app/actions/revalidate-devices";
import { ImageDropzone } from "@/components/admin/image-dropzone";
import { Button } from "@/components/ui/button";
import { replaceDeviceImages, uploadStagedDeviceImage } from "@/lib/admin-api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { Device } from "@/lib/devices-api";

const MIN_IMAGES = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

interface ImageItem {
  key: string;
  /** URL Cloudinary (ảnh đã có, hoặc ảnh mới đã tải lên xong). */
  url?: string;
  /** Ảnh mới chọn từ máy: blob URL để xem trước trong lúc tải. */
  preview?: string;
  isNew: boolean;
  status: "ready" | "uploading" | "error";
  progress: number;
  error?: string;
  file?: File;
}

let keySeq = 0;
const nextKey = () => `img-${++keySeq}`;
const fromDevice = (images: string[]): ImageItem[] =>
  images.map((url) => ({ key: nextKey(), url, isNew: false, status: "ready", progress: 100 }));

/**
 * Sửa ảnh thiết bị: tải nhiều ảnh cùng lúc (tiến độ từng ảnh, xem trước),
 * kéo thả hoặc bấm mũi tên để đổi thứ tự, ảnh đầu tiên là "Ảnh đại diện".
 * Chưa ghi gì vào thiết bị cho tới khi bấm "Lưu ảnh"; dưới 5 ảnh thì khoá Lưu
 * (backend cũng kiểm tra). Ảnh bị bỏ được backend xoá trên Cloudinary SAU khi lưu.
 */
export function DeviceImageManager({ device }: { device: Device }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ImageItem[]>(() => fromDevice(device.images));
  // Ảnh đã tải lên trong phiên nhưng bị bỏ trước khi lưu — gửi kèm để backend xoá.
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const previewsRef = useRef(new Set<string>());

  useEffect(() => {
    const previews = previewsRef.current;
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const readyUrls = items.filter((i) => i.status === "ready" && i.url).map((i) => i.url!);
  const uploading = items.some((i) => i.status === "uploading");
  const hasErrors = items.some((i) => i.status === "error");
  const dirty = useMemo(
    () => readyUrls.length !== device.images.length || readyUrls.some((u, i) => u !== device.images[i]),
    [readyUrls, device.images],
  );
  const tooFew = readyUrls.length < MIN_IMAGES;

  const patch = (key: string, change: Partial<ImageItem>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...change } : i)));

  const startUpload = (item: ImageItem) => {
    patch(item.key, { status: "uploading", progress: 0, error: undefined });
    uploadStagedDeviceImage(item.file!, (progress) => patch(item.key, { progress }))
      .then((url) => patch(item.key, { url, status: "ready", progress: 100 }))
      .catch((error) =>
        patch(item.key, { status: "error", error: getErrorMessage(error, "Tải ảnh thất bại") }),
      );
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted: ImageItem[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: chỉ nhận JPG, PNG hoặc WEBP`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name}: vượt quá 5MB`);
        continue;
      }
      const preview = URL.createObjectURL(file);
      previewsRef.current.add(preview);
      accepted.push({ key: nextKey(), preview, file, isNew: true, status: "uploading", progress: 0 });
    }
    if (accepted.length === 0) return;
    setItems((prev) => [...prev, ...accepted]);
    accepted.forEach(startUpload);
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const remove = (index: number) => {
    const item = items[index];
    if (item.isNew && item.url) setDiscarded((d) => [...d, item.url!]);
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const resetChanges = () => {
    const newUploads = items.filter((i) => i.isNew && i.url).map((i) => i.url!);
    setDiscarded((d) => [...d, ...newUploads]);
    setItems(fromDevice(device.images));
  };

  const saveMutation = useMutation({
    mutationFn: () => replaceDeviceImages(device.id, readyUrls, discarded.filter((u) => !readyUrls.includes(u))),
    onSuccess: async (updated) => {
      toast.success("Đã lưu ảnh thiết bị");
      setDiscarded([]);
      setItems(fromDevice(updated.images));
      queryClient.setQueryData(["admin", "device", device.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["devices"] });
      // Trang chủ + trang chi tiết (Server Component, cache 60 s) hiện ảnh mới ngay.
      await revalidateDevices().catch(() => undefined);
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không lưu được ảnh, vui lòng thử lại")),
  });

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragIndex !== null) move(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="space-y-5">
      <ImageDropzone
        onFilesSelected={addFiles}
        accept={ACCEPTED_TYPES.join(",")}
        hint="Chọn được nhiều ảnh cùng lúc · JPG, PNG, WEBP · tối đa 5MB/ảnh"
      />

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có ảnh nào.</p>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Ảnh thiết bị theo thứ tự hiển thị">
          {items.map((item, index) => {
            const src = item.url ?? item.preview!;
            const isCover = index === 0;
            return (
              <li
                key={item.key}
                draggable={item.status === "ready"}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(index);
                }}
                onDragLeave={() => setOverIndex((o) => (o === index ? null : o))}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDrop={(e) => onDrop(e, index)}
                data-testid="device-image-item"
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-muted/30 transition-shadow",
                  isCover ? "border-primary ring-2 ring-primary/40" : "border-border",
                  overIndex === index && dragIndex !== index && "ring-2 ring-cyan-300",
                  dragIndex === index && "opacity-50",
                )}
              >
                <div className="relative aspect-square">
                  {item.url ? (
                    <Image src={src} alt={`Ảnh ${index + 1}`} fill sizes="200px" className="object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- blob URL xem trước, next/image không hỗ trợ
                    <img src={src} alt={`Ảnh ${index + 1} (đang tải)`} className="absolute inset-0 size-full object-cover" />
                  )}

                  {item.status === "uploading" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-xs text-white">
                      <Loader2 className="size-5 animate-spin" aria-hidden />
                      Đang tải {item.progress}%
                      <div className="h-1.5 w-3/4 overflow-hidden rounded-full bg-white/25">
                        <div className="h-full bg-primary transition-[width]" style={{ width: `${item.progress}%` }} />
                      </div>
                    </div>
                  )}
                  {item.status === "error" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-2 text-center text-xs text-white">
                      <AlertTriangle className="size-5 text-amber-300" aria-hidden />
                      {item.error}
                      <Button size="xs" variant="secondary" onClick={() => startUpload(item)}>
                        Thử lại
                      </Button>
                    </div>
                  )}

                  {isCover ? (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow">
                      <Star className="size-3 fill-current" aria-hidden />
                      Ảnh đại diện
                    </span>
                  ) : (
                    <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                      {index + 1}
                    </span>
                  )}
                  {item.isNew && item.status === "ready" && (
                    <span className="absolute top-2 right-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[11px] font-medium text-white">
                      Mới
                    </span>
                  )}
                  {item.status === "ready" && (
                    <GripVertical
                      className="absolute right-1.5 bottom-1.5 size-4 text-white/80 drop-shadow"
                      aria-hidden
                    />
                  )}
                </div>

                <div className="flex items-center justify-between gap-1 p-1.5">
                  <div className="flex">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Chuyển sang trái"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Chuyển sang phải"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, index + 1)}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                  {!isCover && item.status === "ready" && (
                    <Button size="xs" variant="ghost" className="text-[11px]" onClick={() => move(index, 0)}>
                      Đặt làm ảnh đại diện
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-destructive"
                    aria-label="Bỏ ảnh này"
                    disabled={item.status === "uploading"}
                    onClick={() => remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
        <p className={cn("text-sm", tooFew ? "text-amber-300" : "text-muted-foreground")} role="status">
          {tooFew
            ? `Cần tối thiểu ${MIN_IMAGES} ảnh (đang có ${readyUrls.length})`
            : uploading
              ? "Đang tải ảnh lên…"
              : hasErrors
                ? "Có ảnh tải lỗi — thử lại hoặc bỏ ảnh đó"
                : dirty
                  ? "Có thay đổi chưa lưu — ảnh đầu tiên là ảnh đại diện"
                  : `${readyUrls.length} ảnh · ảnh đầu tiên là ảnh đại diện`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            disabled={!dirty || saveMutation.isPending}
            onClick={resetChanges}
          >
            <RotateCcw className="size-4" aria-hidden />
            Huỷ thay đổi
          </Button>
          <Button
            disabled={tooFew || uploading || hasErrors || !dirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending && <Loader2 className="animate-spin" />}
            Lưu ảnh
          </Button>
        </div>
      </div>
    </div>
  );
}
