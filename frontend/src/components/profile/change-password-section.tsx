"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorBanner } from "@/components/form-error-banner";
import { changePasswordRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  changePasswordSchema,
  type ChangePasswordFormValues,
} from "@/lib/validation/auth-schemas";
import { useAuthStore } from "@/stores/auth-store";

export function ChangePasswordSection() {
  const router = useRouter();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  const mutation = useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: () => {
      toast.success("Đã đổi mật khẩu — vui lòng đăng nhập lại");
      // Đổi mật khẩu xong, backend đã thu hồi access/refresh token hiện tại
      // (xem AuthService.changePassword) — dọn sạch state phía client rồi
      // bắt đăng nhập lại, đúng chuẩn bảo mật.
      clearAuth();
      router.push("/login");
    },
    onError: (error) => {
      setErrorMessage(
        getErrorMessage(error, "Không thể đổi mật khẩu, vui lòng thử lại"),
      );
    },
  });

  function onSubmit(values: ChangePasswordFormValues) {
    setErrorMessage(null);
    mutation.mutate({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
  }

  return (
    <motion.section
      id="security"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div>
          <h2 className="font-heading text-xl font-semibold">Bảo mật</h2>
          <p className="text-sm text-muted-foreground">
            Đổi mật khẩu đăng nhập của bạn.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-6 flex flex-col gap-4"
      >
        {errorMessage && <FormErrorBanner message={errorMessage} />}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.currentPassword}
            {...register("currentPassword")}
          />
          {errors.currentPassword && (
            <p className="text-xs text-destructive">
              {errors.currentPassword.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">
                {errors.newPassword.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-new-password">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmNewPassword}
              {...register("confirmNewPassword")}
            />
            {errors.confirmNewPassword && (
              <p className="text-xs text-destructive">
                {errors.confirmNewPassword.message}
              </p>
            )}
          </div>
        </div>

        <Button
          type="submit"
          className="mt-2 self-start"
          disabled={mutation.isPending}
        >
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Đổi mật khẩu
        </Button>
      </form>
    </motion.section>
  );
}
