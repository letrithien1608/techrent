"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { SiteBackground } from "@/components/home/site-background";
import { AccountOverviewSection } from "@/components/profile/account-overview-section";
import { ChangePasswordSection } from "@/components/profile/change-password-section";
import { ProfileInfoSection } from "@/components/profile/profile-info-section";
import { useAuthStore } from "@/stores/auth-store";

const NAV_ITEMS = [
  { href: "#personal-info", label: "Thông tin cá nhân" },
  { href: "#security", label: "Bảo mật" },
  { href: "#overview", label: "Tổng quan tài khoản" },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();

  useEffect(() => {
    if (hasHydrated && !user) {
      router.push(`/login?redirect=${encodeURIComponent("/profile")}`);
    }
  }, [hasHydrated, user, router]);

  if (!hasHydrated || !user) {
    return null;
  }

  return (
    <div className="relative flex flex-1 flex-col">
      <SiteBackground />
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/" className="transition-colors hover:text-foreground">
              Trang chủ
            </Link>
            <ChevronRight className="size-3.5 shrink-0" />
            <span className="text-foreground">Tài khoản của tôi</span>
          </nav>

          <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Tài khoản của tôi
          </h1>
          <p className="mt-2 text-muted-foreground">
            Quản lý thông tin cá nhân và bảo mật tài khoản.
          </p>
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
          <nav className="hidden lg:block">
            <ul className="sticky top-24 space-y-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-8">
            <ProfileInfoSection />
            <ChangePasswordSection />
            <AccountOverviewSection />
          </div>
        </div>
      </div>
    </div>
  );
}
