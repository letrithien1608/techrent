import Image from "next/image";
import { cn } from "cn";

const SIZE_CLASS = {
  xs: "size-8 text-xs",
  sm: "size-8 text-sm",
  md: "size-9 text-sm",
  lg: "size-11 text-base",
  xl: "size-20 text-3xl sm:size-24",
} as const;

const SIZE_PX: Record<keyof typeof SIZE_CLASS, number> = { xs: 32, sm: 32, md: 36, lg: 44, xl: 96 };

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // Tên tiếng Việt: chữ cái đầu của TÊN (từ cuối) là đặc trưng nhất, kèm họ nếu có.
  const last = parts[parts.length - 1].charAt(0);
  const first = parts.length > 1 ? parts[0].charAt(0) : "";
  return (first + last).toUpperCase();
}

/**
 * Ảnh đại diện (Cloudinary, công khai) nếu có, ngược lại chữ cái đầu trên nền
 * gradient — dùng chung header, menu tài khoản, trang tài khoản, admin, đánh giá.
 * `gradientClassName` đổi màu nền chữ viết tắt (VD danh sách đen dùng tông đỏ).
 */
export function UserAvatar({
  name,
  src,
  size = "md",
  className,
  gradientClassName = "from-primary to-cyan-400",
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  gradientClassName?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-semibold text-primary-foreground ring-2 ring-background",
        gradientClassName,
        SIZE_CLASS[size],
        className,
      )}
    >
      {src ? (
        <Image src={src} alt="" fill sizes={`${SIZE_PX[size]}px`} className="object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
