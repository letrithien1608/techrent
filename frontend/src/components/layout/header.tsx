"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useMotionValueEvent, useScroll } from "framer-motion";
import { User as UserIcon } from "lucide-react";
import { cn } from "cn";
import { AccountMenu } from "@/components/account/account-menu";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useAuthStore } from "@/stores/auth-store";

const NAV_LINKS = [
  { href: "/devices", label: "Thiết bị" },
  { href: "/policies", label: "Chính sách thuê" },
];

export function Header() {
  const pathname = usePathname();
  const { user, hasHydrated } = useAuthStore();
  const [isScrolled, setIsScrolled] = useState(false);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 8);
  });

  // Trang Admin có chrome riêng (sidebar + topbar) — không cần Header khách hàng.
  // Đặt SAU mọi hook để không phá vỡ quy tắc "hook cùng thứ tự mỗi lần render".
  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-all duration-300",
        isScrolled
          ? "border-border/60 bg-background/85 shadow-sm shadow-black/5 backdrop-blur-md"
          : "border-transparent bg-background/40 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight"
          >
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              T
            </span>
            Tech<span className="text-primary">Rent</span>
          </Link>

          <nav className="hidden items-center gap-1 text-[15px] font-medium sm:flex">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href || pathname?.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-1.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/75 hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {!hasHydrated ? null : user ? (
            <>
              <NotificationBell />
              <AccountMenu user={user} />
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                <UserIcon />
                Đăng nhập
              </Button>
              <Button size="sm" nativeButton={false} render={<Link href="/register" />}>
                Đăng ký
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
