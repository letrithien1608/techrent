"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "cn";

interface Props {
  onFilesSelected: (files: FileList | null) => void;
  hint?: string;
  className?: string;
}

/**
 * Dropzone dùng chung cho DeviceForm (chọn ảnh lúc tạo mới) và
 * DeviceImageManager (thêm ảnh ở trang sửa) — cùng hành vi kéo-thả +
 * bấm-để-chọn, chỉ khác `hint` hiển thị.
 */
export function ImageDropzone({ onFilesSelected, hint, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    onFilesSelected(event.dataTransfer.files);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
        isDragging
          ? "border-primary bg-primary/5"
          : "border-border/60 hover:border-primary/50 hover:bg-muted/30",
        className,
      )}
    >
      <UploadCloud
        className={cn(
          "size-8 transition-colors",
          isDragging ? "text-primary" : "text-muted-foreground",
        )}
      />
      <p className="text-sm font-medium text-foreground">
        Kéo thả ảnh vào đây, hoặc bấm để chọn
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          onFilesSelected(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
