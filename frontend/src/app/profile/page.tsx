"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, LayoutGrid, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { SiteBackground } from "@/components/home/site-background";
import { AccountOverviewSection } from "@/components/profile/account-overview-section";
import { ChangePasswordSection } from "@/components/profile/change-password-section";
import { KycVerificationSection } from "@/components/profile/kyc-verification-section";
import { ProfileHeaderCard } from "@/components/profile/profile-header-card";
import { ProfileInfoSection } from "@/components/profile/profile-info-section";
import { fetchMyProfile } from "@/lib/auth-api";
import { useAuthStore } from "@/stores/auth-store";

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "personal-info", label: "Thông tin cá nhân", icon: UserRound },
  { id: "kyc-verification", label: "Xác thực danh tính", icon: ShieldCheck },
  { id: "security", label: "Bảo mật", icon: KeyRound },
  { id: "overview", label: "Tổng quan tài khoản", icon: LayoutGrid },
];

/** Mục đang xem = mục cuối cùng có mép trên đã đi qua 1/3 màn hình (tự cập nhật khi cuộn). */
function useActiveSection(ids: string[], enabled: boolean): string {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const line = window.innerHeight / 3;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      // Cuộn chạm đáy trang thì mục cuối luôn là mục đang xem.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = ids[ids.length - 1];
      }
      setActive(current);
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [ids, enabled]);
  return active;
}

const SECTION_IDS = SECTIONS.map((s) => s.id);

export default function ProfilePage() {
  const router = useRouter();
  const { user, hasHydrated, updateUser } = useAuthStore();
  const ready = hasHydrated && !!user;
  const active = useActiveSection(SECTION_IDS, ready);

  useEffect(() => {
    if (hasHydrated && !user) {
      router.push(`/login?redirect=${encodeURIComponent("/profile")}`);
    }
  }, [hasHydrated, user, router]);

  // Hồ sơ mới nhất từ server (trạng thái hạn chế, ngày tham gia) — đồng bộ lại store nếu khác.
  const profileQuery = useQuery({ queryKey: ["profile", "me"], queryFn: fetchMyProfile, enabled: ready });
  useEffect(() => {
    const p = profileQuery.data;
    if (p) updateUser({ name: p.name, phone: p.phone, cccdMasked: p.cccdMasked, kycVerified: p.kycVerified, createdAt: p.createdAt });
  }, [profileQuery.data, updateUser]);

  if (!ready) return null;

  return (
    <div className="relative flex flex-1 flex-col">
      <SiteBackground />

      {/* Điện thoại/tablet: thanh tab ngang dính dưới header. */}
      <nav
        aria-label="Các mục tài khoản"
        className="scrollbar-thin sticky top-14 z-30 flex gap-1 overflow-x-auto border-b border-border/60 bg-background/90 px-4 py-2 backdrop-blur-xl lg:hidden"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={active === s.id ? "true" : undefined}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              active === s.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <s.icon className="size-4" aria-hidden />
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <ProfileHeaderCard user={user} profile={profileQuery.data} />

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
          <nav aria-label="Các mục tài khoản" className="hidden lg:block">
            <ul className="sticky top-24 flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2 backdrop-blur-xl">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={active === s.id ? "true" : undefined}
                    className={cn(
                      "relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      active === s.id
                        ? "bg-primary/10 text-primary before:absolute before:top-2.5 before:bottom-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-primary"
                        : "text-foreground/75 hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <s.icon className="size-[18px]" aria-hidden />
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex min-w-0 flex-col gap-8">
            <ProfileInfoSection />
            <KycVerificationSection />
            <ChangePasswordSection />
            <AccountOverviewSection />
          </div>
        </div>
      </div>
    </div>
  );
}
