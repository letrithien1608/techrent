"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resetPasswordRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from "@/lib/validation/auth-schemas";

// Đổi mật khẩu xong hiện toast + đợi 1 nhịp ngắn rồi mới tự chuyển về /login
// (đủ thời gian để người dùng đọc được thông báo thành công).
const REDIRECT_DELAY_MS = 2000;

function InvalidTokenCard({ message }: { message: string }) {
  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <XCircle className="size-14 text-destructive" />
        <h1 className="font-heading text-xl font-bold">Liên kết không hợp lệ</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button
          className="mt-2 w-full"
          nativeButton={false}
          render={<Link href="/forgot-password" />}
        >
          Yêu cầu link mới
        </Button>
      </CardContent>
    </Card>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmNewPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ResetPasswordFormValues) =>
      resetPasswordRequest({
        token: token ?? "",
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      toast.success("Đặt lại mật khẩu thành công — vui lòng đăng nhập lại");
      setTimeout(() => router.push("/login"), REDIRECT_DELAY_MS);
    },
    onError: (error) => {
      setErrorMessage(
        getErrorMessage(
          error,
          "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
        ),
      );
    },
  });

  function onSubmit(values: ResetPasswordFormValues) {
    setErrorMessage(null);
    mutation.mutate(values);
  }

  // Thiếu token ngay từ đầu (link bị cắt/gõ tay sai) — không có gì để submit,
  // hiện lỗi ngay, KHÔNG hiện form trống.
  if (!token) {
    return (
      <InvalidTokenCard message="Liên kết đặt lại mật khẩu không hợp lệ — thiếu token. Vui lòng yêu cầu link mới." />
    );
  }

  // Lỗi từ backend (token sai/hết hạn — xem AuthService.resetPassword) —
  // thay hẳn form bằng thông báo lỗi rõ ràng + nút quay lại /forgot-password,
  // vì lỗi này không thể tự sửa bằng việc nhập lại mật khẩu trong form cũ.
  if (errorMessage) {
    return <InvalidTokenCard message={errorMessage} />;
  }

  if (mutation.isSuccess) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-14 text-emerald-400" />
          <h1 className="font-heading text-xl font-bold">
            Đặt lại mật khẩu thành công
          </h1>
          <p className="text-sm text-muted-foreground">
            Đang chuyển tới trang đăng nhập...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Đặt lại mật khẩu</CardTitle>
        <CardDescription>
          Nhập mật khẩu mới cho tài khoản của bạn.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <Input
              id="newPassword"
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
            <Label htmlFor="confirmNewPassword">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirmNewPassword"
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

          <Button
            type="submit"
            size="lg"
            className="mt-2"
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            {mutation.isPending ? "Đang xử lý..." : "Đặt lại mật khẩu"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
