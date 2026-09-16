"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { FormErrorBanner } from "@/components/form-error-banner";
import { registerRequest } from "@/lib/auth-api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  registerSchema,
  type RegisterFormValues,
} from "@/lib/validation/auth-schemas";
import { useAuthStore } from "@/stores/auth-store";

export default function RegisterPage() {
  const router = useRouter();
  const { user, hasHydrated, setAuth } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", phone: "" },
  });

  const mutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (data) => {
      setAuth(data);
      toast.success(`Đăng ký thành công! Chào mừng ${data.user.name}.`);
      router.push("/");
    },
    onError: (error) => {
      setErrorMessage(getErrorMessage(error, "Đăng ký thất bại, vui lòng thử lại"));
    },
  });

  useEffect(() => {
    if (hasHydrated && user) {
      router.replace("/");
    }
  }, [hasHydrated, user, router]);

  const onSubmit = (values: RegisterFormValues) => {
    setErrorMessage(null);
    mutation.mutate({
      name: values.name,
      email: values.email,
      password: values.password,
      phone: values.phone || undefined,
    });
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Tạo tài khoản TechRent</CardTitle>
          <CardDescription>
            Đăng ký để bắt đầu thuê thiết bị công nghệ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            {errorMessage && <FormErrorBanner message={errorMessage} />}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Họ và tên</Label>
              <Input
                id="name"
                autoComplete="name"
                placeholder="Nguyễn Văn A"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

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
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone">Số điện thoại (không bắt buộc)</Label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="0901234567"
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              {errors.phone && (
                <p className="text-xs text-destructive">{errors.phone.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Tối thiểu 8 ký tự"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">
                  {errors.password.message}
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
              {mutation.isPending ? "Đang tạo tài khoản..." : "Đăng ký"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Đã có tài khoản?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Đăng nhập
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
