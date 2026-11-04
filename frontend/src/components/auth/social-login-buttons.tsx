"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import {
  SOCIAL_PROVIDER_LABEL,
  SOCIAL_REDIRECT_KEY,
  fetchSocialProviders,
  socialStartUrl,
  type SocialProvider,
} from "@/lib/social-auth-api";

/** Logo chính thức (lucide-react của dự án không có icon thương hiệu). */
export function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function FacebookLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"
      />
    </svg>
  );
}

export const PROVIDER_LOGO: Record<SocialProvider, (props: { className?: string }) => React.ReactElement> = {
  google: GoogleLogo,
  facebook: FacebookLogo,
};

// Đúng nhận diện từng hãng: Google nền trắng chữ tối + logo 4 màu; Facebook nền #1877F2 chữ trắng.
const BUTTON_CLASS: Record<SocialProvider, string> = {
  google: "border border-[#dadce0] bg-white text-[#1f1f1f] hover:bg-[#f8f9fa]",
  facebook: "bg-[#1877F2] text-white hover:bg-[#166FE5]",
};

/**
 * Dòng "hoặc" + nút "Tiếp tục với Google/Facebook" — chỉ hiện provider đang
 * bật ở backend. Bấm nút = điều hướng CẢ TRANG sang backend (không fetch),
 * backend tạo state chống CSRF rồi chuyển tiếp sang Google/Facebook.
 */
export function SocialLoginButtons({ redirectTo }: { redirectTo?: string }) {
  const query = useQuery({
    queryKey: ["auth", "social-providers"],
    queryFn: fetchSocialProviders,
    staleTime: 5 * 60_000,
  });
  const providers = query.data ?? [];
  if (providers.length === 0) return null;

  const remember = () => {
    try {
      if (redirectTo && redirectTo !== "/") sessionStorage.setItem(SOCIAL_REDIRECT_KEY, redirectTo);
      else sessionStorage.removeItem(SOCIAL_REDIRECT_KEY);
    } catch {
      // sessionStorage bị chặn — sau khi đăng nhập về trang chủ.
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground" role="separator">
        <span className="h-px flex-1 bg-border" />
        hoặc
        <span className="h-px flex-1 bg-border" />
      </div>
      {providers.map((provider) => {
        const Logo = PROVIDER_LOGO[provider];
        return (
          <a
            key={provider}
            href={socialStartUrl(provider)}
            onClick={remember}
            className={cn(
              "flex h-11 items-center justify-center gap-3 rounded-lg px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              BUTTON_CLASS[provider],
            )}
          >
            <Logo className="size-5" />
            Tiếp tục với {SOCIAL_PROVIDER_LABEL[provider]}
          </a>
        );
      })}
      <p className="text-center text-xs text-muted-foreground">
        Lần đầu dùng Google/Facebook, bạn vẫn cần nhập SĐT và số CCCD để hoàn tất đăng ký.
      </p>
    </div>
  );
}
