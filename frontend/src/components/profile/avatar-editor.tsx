"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, ImagePlus, Loader2, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/account/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeAvatarRequest, uploadAvatarRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
/** Khung cắt hiển thị (px) và kích thước ảnh xuất ra (backend resize tiếp về 256x256). */
const VIEWPORT = 280;
const OUTPUT = 512;
const MAX_ZOOM = 3;

interface CropState {
  x: number;
  y: number;
  zoom: number;
}

/** Giữ ảnh luôn phủ kín khung vuông (không lộ nền trống khi kéo/thu phóng). */
function clamp(state: CropState, img: HTMLImageElement): CropState {
  const scale = (VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)) * state.zoom;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return {
    zoom: state.zoom,
    x: Math.min(0, Math.max(VIEWPORT - w, state.x)),
    y: Math.min(0, Math.max(VIEWPORT - h, state.y)),
  };
}

function centered(img: HTMLImageElement): CropState {
  const scale = VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight);
  return {
    zoom: 1,
    x: (VIEWPORT - img.naturalWidth * scale) / 2,
    y: (VIEWPORT - img.naturalHeight * scale) / 2,
  };
}

/** Cắt đúng vùng đang thấy trong khung → JPEG vuông OUTPUT×OUTPUT. */
function exportCrop(img: HTMLImageElement, state: CropState): Promise<Blob> {
  const scale = (VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)) * state.zoom;
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -state.x / scale, -state.y / scale, VIEWPORT / scale, VIEWPORT / scale, 0, 0, OUTPUT, OUTPUT);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Không xử lý được ảnh"))), "image/jpeg", 0.9),
  );
}

/**
 * Vòng tròn avatar ở đầu trang tài khoản — bấm để đổi ảnh: chọn ảnh từ máy,
 * kéo/thu phóng trong khung vuông (crop), xem trước, lưu; hoặc xoá ảnh để quay
 * về chữ viết tắt. Ảnh đại diện là ảnh CÔNG KHAI, khác hẳn ảnh eKYC.
 */
export function AvatarEditor({ user }: { user: AuthUser }) {
  const updateUser = useAuthStore((s) => s.updateUser);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>({ x: 0, y: 0, zoom: 1 });
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // Giải phóng blob URL của ảnh đang cắt khi đổi ảnh/đóng hộp thoại.
  useEffect(() => () => void (source && URL.revokeObjectURL(source)), [source]);

  // Ảnh xem trước nhỏ cập nhật theo vùng cắt (vẽ lại bằng canvas, không gọi server).
  useEffect(() => {
    if (!img) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      exportCrop(img, crop).then((blob) => {
        if (cancelled) return;
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [img, crop]);

  const reset = useCallback(() => {
    setSource(null);
    setImg(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Chỉ nhận ảnh JPG, PNG hoặc WEBP");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Ảnh vượt quá 5MB, vui lòng chọn ảnh nhỏ hơn");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      setSource(url);
      setImg(image);
      setCrop(centered(image));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      toast.error("Không đọc được ảnh này");
    };
    image.src = url;
  };

  const saveMutation = useMutation({
    mutationFn: async () => uploadAvatarRequest(await exportCrop(img!, crop)),
    onSuccess: (data) => {
      updateUser({ avatarUrl: data.avatarUrl ?? null });
      toast.success("Đã cập nhật ảnh đại diện");
      reset();
      setOpen(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không lưu được ảnh đại diện")),
  });
  const removeMutation = useMutation({
    mutationFn: removeAvatarRequest,
    onSuccess: () => {
      updateUser({ avatarUrl: null });
      toast.success("Đã xoá ảnh đại diện");
      setOpen(false);
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không xoá được ảnh đại diện")),
  });
  const busy = saveMutation.isPending || removeMutation.isPending;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: crop.x, y: crop.y };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !img) return;
    const d = drag.current;
    setCrop((c) => clamp({ ...c, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, img));
  };
  const setZoom = (zoom: number) => {
    if (!img) return;
    setCrop((c) => {
      // Thu phóng quanh tâm khung để vùng đang xem không bị trôi.
      const ratio = zoom / c.zoom;
      const cx = VIEWPORT / 2;
      return clamp({ zoom, x: cx - (cx - c.x) * ratio, y: cx - (cx - c.y) * ratio }, img);
    });
  };

  const scale = img ? (VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)) * crop.zoom : 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Đổi ảnh đại diện"
      >
        <UserAvatar name={user.name} src={user.avatarUrl} size="xl" className="ring-4" />
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-full bg-black/55 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-5" aria-hidden />
          Đổi ảnh
        </span>
        <span className="absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground sm:hidden">
          <Camera className="size-3.5" aria-hidden />
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi ảnh đại diện</DialogTitle>
            <DialogDescription>
              {img
                ? "Kéo ảnh để căn chỉnh, dùng thanh trượt để phóng to. Vùng trong vòng tròn sẽ là ảnh đại diện."
                : "JPG, PNG hoặc WEBP, tối đa 5MB. Ảnh đại diện hiển thị công khai (khác ảnh xác thực danh tính)."}
            </DialogDescription>
          </DialogHeader>

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          {img && source ? (
            <div className="flex flex-col items-center gap-4">
              <div
                className="relative cursor-grab touch-none overflow-hidden rounded-2xl bg-black select-none active:cursor-grabbing"
                style={{ width: VIEWPORT, height: VIEWPORT }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                role="img"
                aria-label="Vùng cắt ảnh đại diện"
                data-testid="avatar-crop-area"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL cục bộ, next/image không hỗ trợ */}
                <img
                  src={source}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none origin-top-left"
                  style={{
                    left: crop.x,
                    top: crop.y,
                    width: img.naturalWidth * scale,
                    height: img.naturalHeight * scale,
                  }}
                />
                {/* Phủ tối bên ngoài vòng tròn — vùng sáng là phần sẽ hiện trên avatar. */}
                <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/80" />
              </div>

              <div className="flex w-full max-w-[280px] items-center gap-2">
                <ZoomOut className="size-4 text-muted-foreground" aria-hidden />
                <input
                  type="range"
                  min={1}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={crop.zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-primary"
                  aria-label="Phóng to ảnh"
                />
                <ZoomIn className="size-4 text-muted-foreground" aria-hidden />
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                Xem trước
                <span className="relative size-14 overflow-hidden rounded-full ring-2 ring-border">
                  {preview && (
                    // eslint-disable-next-line @next/next/no-img-element -- blob URL cục bộ
                    <img src={preview} alt="Xem trước ảnh đại diện" className="size-full" />
                  )}
                </span>
                <span className="relative size-8 overflow-hidden rounded-full ring-2 ring-border">
                  {preview && (
                    // eslint-disable-next-line @next/next/no-img-element -- blob URL cục bộ
                    <img src={preview} alt="" className="size-full" />
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-2">
              <UserAvatar name={user.name} src={user.avatarUrl} size="xl" />
              <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="size-4" aria-hidden />
                Chọn ảnh từ máy
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {img ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={reset}>
                Chọn ảnh khác
              </Button>
            ) : user.avatarUrl ? (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => removeMutation.mutate()}
              >
                {removeMutation.isPending ? <Loader2 className="animate-spin" /> : <Trash2 className="size-4" />}
                Xoá ảnh
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" disabled={!img || busy} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending && <Loader2 className="animate-spin" />}
              Lưu ảnh đại diện
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
