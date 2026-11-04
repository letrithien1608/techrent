"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { changePasswordRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import { changePasswordSchema, type ChangePasswordFormValues } from "@/lib/validation/auth-schemas";
import { useAuthStore } from "@/stores/auth-store";
import { FieldError, LABEL_CLASS, PasswordInput, SectionCard } from "./profile-shared";

const STRENGTH_LEVELS = [
  { label: "Rất yếu", bar: "bg-red-500", text: "text-red-300" },
  { label: "Yếu", bar: "bg-orange-500", text: "text-orange-300" },
  { label: "Trung bình", bar: "bg-amber-400", text: "text-amber-300" },
  { label: "Mạnh", bar: "bg-emerald-500", text: "text-emerald-300" },
  { label: "Rất mạnh", bar: "bg-emerald-400", text: "text-emerald-300" },
];

/** Điểm 0-4: độ dài + đa dạng ký tự (chỉ gợi ý, backend vẫn chỉ yêu cầu ≥ 8 ký tự). */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(4, Math.max(0, score - (password.length < 8 ? 1 : 0)));
}

function StrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordStrength(password);
  const level = STRENGTH_LEVELS[score];
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="flex gap-1.5" aria-hidden>
        {STRENGTH_LEVELS.slice(1).map((_, index) => (
          <span key={index} className={cn("h-1.5 flex-1 rounded-full", index < score ? level.bar : "bg-muted")} />
        ))}
      </div>
      <p className={cn("text-[13px]", level.text)}>
        Độ mạnh: {level.label}
        {score < 3 && " — thêm chữ hoa, số và ký tự đặc biệt để an toàn hơn"}
      </p>
    </div>
  );
}

export function ChangePasswordSection() {
  const router = useRouter();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const hasPassword = useAuthStore((state) => state.user?.hasPassword !== false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });
  const newPassword = useWatch({ control, name: "newPassword" });

  const mutation = useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: () => {
      toast.success("Đã đổi mật khẩu — vui lòng đăng nhập lại");
      // Backend đã thu hồi access/refresh token hiện tại (AuthService.changePassword).
      clearAuth();
      router.push("/login");
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể đổi mật khẩu, vui lòng thử lại")),
  });

  // Tài khoản đăng ký bằng Google/Facebook chưa có mật khẩu → không có gì để "đổi".
  if (!hasPassword) {
    return (
      <SectionCard id="security" icon={KeyRound} title="Bảo mật" description="Đổi mật khẩu đăng nhập.">
        <p className="text-sm text-muted-foreground">
          Tài khoản của bạn đăng ký bằng Google/Facebook nên chưa có mật khẩu. Đặt mật khẩu ở mục{" "}
          <a href="#login-methods" className="font-medium text-primary hover:underline">
            Phương thức đăng nhập
          </a>{" "}
          nếu muốn đăng nhập thêm bằng email.
        </p>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      id="security"
      icon={KeyRound}
      title="Bảo mật"
      description="Đổi mật khẩu đăng nhập. Sau khi đổi, bạn sẽ cần đăng nhập lại trên mọi thiết bị."
    >
      <form
        onSubmit={handleSubmit((v) => mutation.mutate({ currentPassword: v.currentPassword, newPassword: v.newPassword }))}
        noValidate
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-2 md:max-w-[calc(50%-0.625rem)]">
          <Label htmlFor="current-password" className={LABEL_CLASS}>
            Mật khẩu hiện tại
          </Label>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            {...register("currentPassword")}
          />
          <FieldError message={errors.currentPassword?.message} />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password" className={LABEL_CLASS}>
              Mật khẩu mới
            </Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...register("newPassword")}
            />
            <FieldError message={errors.newPassword?.message} />
            <StrengthMeter password={newPassword} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-new-password" className={LABEL_CLASS}>
              Nhập lại mật khẩu mới
            </Label>
            <PasswordInput
              id="confirm-new-password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmNewPassword}
              {...register("confirmNewPassword")}
            />
            <FieldError message={errors.confirmNewPassword?.message} />
          </div>
        </div>

        <div className="border-t border-border/60 pt-5">
          <Button type="submit" className="h-11 px-6" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Đổi mật khẩu
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
