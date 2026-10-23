import { cn } from "cn";

const SIZE_CLASS = {
  sm: "size-8 text-sm",
  md: "size-9 text-sm",
  lg: "size-11 text-base",
  xl: "size-20 text-3xl sm:size-24",
} as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // Tên tiếng Việt: chữ cái đầu của TÊN (từ cuối) là đặc trưng nhất, kèm họ nếu có.
  const last = parts[parts.length - 1].charAt(0);
  const first = parts.length > 1 ? parts[0].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Avatar chữ cái đầu trên nền gradient cyan — dùng chung header, trang tài khoản, thông báo. */
export function UserAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-400 font-semibold text-primary-foreground ring-2 ring-background",
        SIZE_CLASS[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
