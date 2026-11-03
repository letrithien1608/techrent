"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { ImageDropzone } from "@/components/admin/image-dropzone";

/**
 * Chọn nhiều ảnh (kéo-thả hoặc bấm) + xem trước + bỏ từng ảnh — dùng cho biên
 * bản giao máy và biên bản nhận lại máy. Xem trước bằng blob URL qua `<img>`
 * thường (blob: không khớp `images.remotePatterns` của next/image).
 */
export function PhotoPicker({
  files,
  onChange,
  hint,
  max = 10,
  allowVideo = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  hint?: string;
  max?: number;
  /** Cho phép cả video (báo lỗi thiết bị). */
  allowVideo?: boolean;
}) {
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const images = Array.from(list).filter(
      (file) => file.type.startsWith("image/") || (allowVideo && file.type.startsWith("video/")),
    );
    onChange([...files, ...images].slice(0, max));
  }

  return (
    <div className="space-y-2">
      <ImageDropzone
        onFilesSelected={addFiles}
        hint={hint}
        className="py-5"
        accept={allowVideo ? "image/*,video/*" : "image/*"}
        label={allowVideo ? "Kéo thả ảnh/video vào đây, hoặc bấm để chọn" : undefined}
      />
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
          {previews.map((src, index) => (
            <div key={src} className="group relative aspect-square overflow-hidden rounded-lg bg-muted">
              {files[index]?.type.startsWith("video/") ? (
                <video src={src} className="size-full object-cover" muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={`Ảnh đã chọn ${index + 1}`} className="size-full object-cover" />
              )}
              <button
                type="button"
                aria-label={`Bỏ ảnh ${index + 1}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white opacity-80 hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
