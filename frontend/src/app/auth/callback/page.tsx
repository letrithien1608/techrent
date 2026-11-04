"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  SOCIAL_PROVIDER_LABEL,
  SOCIAL_REDIRECT_KEY,
  exchangeSocialCode,
  type SocialProvider,
} from "@/lib/social-auth-api";
import { useAuthStore } from "@/stores/auth-store";

/** Mã lỗi backend gửi về (SocialAuthService.callbackError) → thông báo cho người dùng. */
const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  cancelled: {
    title: "Bạn đã huỷ đăng nhập",
    description: "Bạn đã bấm huỷ ở trang Google/Facebook. Có thể thử lại bất cứ lúc nào.",
  },
  invalid_state: {
    title: "Phiên đăng nhập không hợp lệ",
    description:
      "Liên kết đăng nhập đã hết hạn hoặc đã được dùng (bảo vệ chống giả mạo). Vui lòng bấm lại nút Google/Facebook.",
  },
  provider_error: {
    title: "Không kết nối được Google/Facebook",
    description: "Đã có lỗi khi xác minh với nhà cung cấp. Vui lòng thử lại sau ít phút.",
  },
  provider_disabled: {
    title: "Phương thức đăng nhập tạm thời không khả dụng",
    description: "Vui lòng đăng nhập bằng email và mật khẩu.",
  },
  already_linked: {
    title: "Tài khoản đã được liên kết",
    description: "Tài khoản mạng xã hội này đang gắn với một tài khoản TechRent khác.",
  },
  link_conflict: {
    title: "Không thể liên kết",
    description:
      "Tài khoản TechRent của bạn đã gắn một tài khoản khác cùng loại. Gỡ liên kết cũ trong Tài khoản → Phương thức đăng nhập rồi thử lại.",
  },
  staff_must_link: {
    title: "Tài khoản quản trị phải đăng nhập bằng mật khẩu",
    description:
      "Tài khoản quản trị phải đăng nhập bằng mật khẩu rồi liên kết Google trong trang Tài khoản (mục Phương thức đăng nhập).",
  },
  account_locked: {
    title: "Tài khoản bị khoá",
    description: "Tài khoản này đang bị hạn chế. Vui lòng liên hệ cửa hàng để được hỗ trợ.",
  },
};

function sanitizeRedirect(target: string | null): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

function takeRedirect(): string {
  try {
    const value = sessionStorage.getItem(SOCIAL_REDIRECT_KEY);
    sessionStorage.removeItem(SOCIAL_REDIRECT_KEY);
    return sanitizeRedirect(value);
  } catch {
    return "/";
  }
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);
  const code = searchParams.get("code");
  const linked = searchParams.get("linked") as SocialProvider | null;
  const errorCode = searchParams.get("error");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  // Mã chỉ dùng được 1 lần — chặn effect chạy 2 lần (React StrictMode) đổi mã 2 lần.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (code) {
      exchangeSocialCode(code)
        .then((data) => {
          setAuth(data);
          toast.success(`Chào mừng, ${data.user.name}!`);
          router.replace(takeRedirect());
        })
        .catch((error) => setExchangeError(getErrorMessage(error, "Đăng nhập thất bại, vui lòng thử lại")));
    } else if (linked) {
      Promise.resolve().then(() => {
        void queryClient.invalidateQueries({ queryKey: ["auth", "social-accounts"] });
        toast.success(`Đã liên kết ${SOCIAL_PROVIDER_LABEL[linked] ?? linked}`);
        router.replace("/profile#login-methods");
      });
    }
  }, [code, linked, router, setAuth, queryClient]);

  const failure = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.provider_error)
    : exchangeError
      ? { title: "Không thể hoàn tất đăng nhập", description: exchangeError }
      : !code && !linked
        ? ERROR_MESSAGES.invalid_state
        : null;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        {failure ? (
          <>
            <CardHeader>
              <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertTriangle className="size-5" aria-hidden />
              </span>
              <CardTitle className="text-xl">{failure.title}</CardTitle>
              <CardDescription>{failure.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
                Quay lại đăng nhập
              </Button>
              <Button size="lg" variant="ghost" nativeButton={false} render={<Link href="/" />}>
                Về trang chủ
              </Button>
            </CardContent>
          </>
        ) : (
          <CardHeader className="items-center text-center">
            <Loader2 className="mx-auto mb-2 size-8 animate-spin text-primary" aria-hidden />
            <CardTitle className="text-xl">Đang hoàn tất đăng nhập...</CardTitle>
            <CardDescription>Vui lòng đợi trong giây lát.</CardDescription>
          </CardHeader>
        )}
      </Card>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackContent />
    </Suspense>
  );
}
