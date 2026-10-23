"use client";

import { forwardRef, useState, type ComponentProps, type ReactNode } from "react";
import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";

/** Ô nhập cỡ lớn dùng chung trang tài khoản (Input gốc chỉ cao 32px). */
export const FIELD_CLASS = "h-11 rounded-xl px-3.5 text-[15px] md:text-[15px]";
export const LABEL_CLASS = "text-sm font-medium text-foreground/90";

export function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-28 rounded-3xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/**
 * Ô thống kê dùng chung — thêm chỉ số mới (VD tiền cọc đang giữ, số lần báo
 * lỗi) chỉ cần truyền thêm 1 ô, không sửa component.
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "text-primary bg-primary/15",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 rounded-2xl border border-white/10 bg-background/40 p-3.5 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="w-full min-w-0">
        <p className="truncate text-[13px] text-muted-foreground">{label}</p>
        <p className="truncate text-base font-semibold tracking-tight sm:text-lg" title={typeof value === "string" ? value : undefined}>
          {value}
        </p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** Ô mật khẩu có nút hiện/ẩn — tương thích react-hook-form `register()` (forwardRef). */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<ComponentProps<"input">, "type">>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn(FIELD_CLASS, "pr-11", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[13px] text-red-300">
      {message}
    </p>
  );
}
