"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Clock, Link2Off, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PROVIDER_LOGO, SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { FormErrorBanner } from "@/components/form-error-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  SOCIAL_PROVIDER_LABEL,
  fetchSocialTicket,
  socialRegisterRequest,
  type SocialTicket,
} from "@/lib/social-auth-api";
import { socialRegisterSchema, type SocialRegisterFormValues } from "@/lib/validation/auth-schemas";
import { useAuthStore } from "@/stores/auth-store";

/** Phiếu hết hạn/đã dùng → backend trả 410 Gone. */
function isExpired(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 410;
}

function StateCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Clock;
  title: string;
  description: string;
}) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
          <Icon className="size-5" aria-hidden />
        </span>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <SocialLoginButtons />
        <Button variant="ghost" size="lg" nativeButton={false} render={<Link href="/register" />}>
          Đăng ký bằng email
        </Button>
      </CardContent>
    </Card>
  );
}

function SocialRegisterForm({ ticket, info }: { ticket: string; info: SocialTicket }) {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const emailLocked = info.emailVerified && !!info.email;
  const providerLabel = SOCIAL_PROVIDER_LABEL[info.provider];
  const Logo = PROVIDER_LOGO[info.provider];

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SocialRegisterFormValues>({
    resolver: zodResolver(socialRegisterSchema),
    mode: "onTouched",
    defaultValues: {
      name: info.name ?? "",
      email: info.email ?? "",
      phone: "",
      cccd: "",
      acceptTerms: false,
    },
  });

  const mutation = useMutation({
    mutationFn: socialRegisterRequest,
    onSuccess: (data) => {
      setAuth(data);
      toast.success(`Đăng ký thành công! Chào mừng ${data.user.name}.`, {
        description: "Hoàn tất xác thực danh tính (eKYC) để bắt đầu đặt thuê.",
      });
      router.push("/profile#kyc-verification");
    },
    onError: (error) => {
      if (isExpired(error)) {
        setExpired(true);
        return;
      }
      setErrorMessage(getErrorMessage(error, "Đăng ký thất bại, vui lòng thử lại"));
    },
  });

  if (expired) {
    return (
      <StateCard
        icon={Clock}
        title="Phiên đăng ký đã hết hạn"
        description="Thông tin tạm từ Google/Facebook chỉ được giữ 15 phút. Chưa có tài khoản nào được tạo — bấm lại nút bên dưới để làm lại."
      />
    );
  }

  const onSubmit = (values: SocialRegisterFormValues) => {
    setErrorMessage(null);
    mutation.mutate({
      ticket,
      name: values.name,
      ...(emailLocked ? {} : { email: values.email }),
      phone: values.phone,
      cccd: values.cccd,
      acceptTerms: values.acceptTerms,
    });
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-full bg-white">
            <Logo className={info.provider === "facebook" ? "size-5 text-[#1877F2]" : "size-5"} />
          </span>
          Đã xác minh với {providerLabel}
        </div>
        <CardTitle className="text-xl">Hoàn tất đăng ký TechRent</CardTitle>
        <CardDescription>
          {providerLabel} chỉ thay cho email và mật khẩu. Để thuê thiết bị, bạn vẫn cần cung cấp số điện thoại và số
          CCCD — mỗi số chỉ dùng cho 1 tài khoản.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {errorMessage && <FormErrorBanner message={errorMessage} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Họ và tên</Label>
            <Input id="name" autoComplete="name" className="h-10" aria-invalid={!!errors.name} {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                autoComplete="email"
                className="h-10 pr-9"
                readOnly={emailLocked}
                aria-readonly={emailLocked}
                aria-invalid={!!errors.email}
                placeholder="ban@example.com"
                {...register("email")}
              />
              {emailLocked && (
                <Lock className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              )}
            </div>
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {emailLocked
                  ? `Email đã được ${providerLabel} xác minh, không thể thay đổi.`
                  : `${providerLabel} không cung cấp email — nhập email của bạn, chúng tôi sẽ gửi thư xác thực.`}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="0901234567"
              className="h-10"
              aria-invalid={!!errors.phone}
              {...register("phone")}
            />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cccd">Số CCCD</Label>
            <Input
              id="cccd"
              inputMode="numeric"
              autoComplete="off"
              placeholder="079203012345"
              className="h-10"
              aria-invalid={!!errors.cccd}
              {...register("cccd")}
            />
            {errors.cccd ? (
              <p className="text-xs text-destructive">{errors.cccd.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Mã hoá khi lưu, không hiển thị đầy đủ ở bất kỳ đâu.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-primary"
                aria-invalid={!!errors.acceptTerms}
                {...register("acceptTerms")}
              />
              <span>
                Tôi đồng ý với{" "}
                <Link href="/policies" target="_blank" className="font-medium text-primary hover:underline">
                  chính sách thuê
                </Link>{" "}
                và cho phép TechRent xử lý dữ liệu cá nhân (SĐT, CCCD) để xác minh danh tính khi thuê thiết bị.
              </span>
            </label>
            {errors.acceptTerms && <p className="text-xs text-destructive">{errors.acceptTerms.message}</p>}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-xs text-foreground/80">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            Sau khi đăng ký, bạn cần xác thực danh tính (ảnh CCCD + ảnh chân dung) trong trang Tài khoản trước khi đặt thuê.
          </div>

          <Button type="submit" size="lg" className="h-11" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            {mutation.isPending ? "Đang tạo tài khoản..." : "Hoàn tất đăng ký"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SocialRegisterContent() {
  const router = useRouter();
  const ticket = useSearchParams().get("ticket") ?? "";
  const { user, hasHydrated } = useAuthStore();

  useEffect(() => {
    if (hasHydrated && user) router.replace("/");
  }, [hasHydrated, user, router]);

  const query = useQuery({
    queryKey: ["auth", "social-ticket", ticket],
    queryFn: () => fetchSocialTicket(ticket),
    enabled: !!ticket,
    retry: false,
    staleTime: Infinity,
  });

  let content: React.ReactNode;
  if (!ticket) {
    content = (
      <StateCard
        icon={Link2Off}
        title="Thiếu thông tin đăng ký"
        description="Trang này chỉ mở được sau khi bấm “Tiếp tục với Google/Facebook”. Hãy bắt đầu lại từ nút bên dưới."
      />
    );
  } else if (query.isPending) {
    content = (
      <Card className="w-full max-w-md" aria-busy>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-7 w-56" />
          <Skeleton className="mt-2 h-12 w-full" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
          <Skeleton className="h-11 w-full" />
        </CardContent>
      </Card>
    );
  } else if (query.isError) {
    content = isExpired(query.error) ? (
      <StateCard
        icon={Clock}
        title="Phiên đăng ký đã hết hạn"
        description="Thông tin tạm từ Google/Facebook chỉ được giữ 15 phút và dùng 1 lần. Chưa có tài khoản nào được tạo — bấm lại nút bên dưới để làm lại từ đầu."
      />
    ) : (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Không tải được thông tin đăng ký</CardTitle>
          <CardDescription>{getErrorMessage(query.error, "Vui lòng kiểm tra kết nối và thử lại.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" onClick={() => query.refetch()}>
            Thử lại
          </Button>
        </CardContent>
      </Card>
    );
  } else {
    content = <SocialRegisterForm ticket={ticket} info={query.data} />;
  }

  return <div className="flex flex-1 items-center justify-center px-4 py-10 sm:py-12">{content}</div>;
}

export default function SocialRegisterPage() {
  return (
    <Suspense fallback={null}>
      <SocialRegisterContent />
    </Suspense>
  );
}
