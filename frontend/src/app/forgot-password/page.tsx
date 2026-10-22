"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
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
import { FormErrorBanner } from "@/components/form-error-banner";
import { forgotPasswordRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/validation/auth-schemas";

export default function ForgotPasswordPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: ForgotPasswordFormValues) =>
      forgotPasswordRequest(values.email),
    onError: (error) => {
      setErrorMessage(
        getErrorMessage(error, "Không thể gửi yêu cầu, vui lòng thử lại"),
      );
    },
  });

  function onSubmit(values: ForgotPasswordFormValues) {
    setErrorMessage(null);
    mutation.mutate(values);
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Quên mật khẩu</CardTitle>
          <CardDescription>
            Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mutation.isSuccess ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <MailCheck className="size-10 text-primary" />
              <p className="text-sm text-muted-foreground">
                Nếu email này tồn tại trong hệ thống, chúng tôi đã gửi link đặt
                lại mật khẩu. Vui lòng kiểm tra hộp thư (kể cả mục thư rác).
              </p>
              <Link
                href="/login"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <ArrowLeft className="size-4" />
                Quay lại đăng nhập
              </Link>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={handleSubmit(onSubmit)}
              noValidate
            >
              {errorMessage && <FormErrorBanner message={errorMessage} />}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="ban@example.com"
                  aria-invalid={!!errors.email}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">
                    {errors.email.message}
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
                {mutation.isPending ? "Đang gửi..." : "Gửi link đặt lại mật khẩu"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link
                  href="/login"
                  className="font-medium text-primary hover:underline"
                >
                  Quay lại đăng nhập
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
