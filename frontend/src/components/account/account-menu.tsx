"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Menu } from "@base-ui/react/menu";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { logoutRequest } from "@/lib/auth-api";
import { ROLE_LABEL } from "@/lib/user-format";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";
import { UserAvatar } from "./user-avatar";

const ITEM_CLASS =
  "flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground/90 outline-none transition-colors data-highlighted:bg-muted data-highlighted:text-foreground";

/** Đã xác thực danh tính = có CCCD + đủ 3 ảnh eKYC (đúng điều kiện chặn đặt thuê ở backend). */
export function isIdentityVerified(user: AuthUser): boolean {
  return !!user.cccdMasked && !!user.kycVerified;
}

function MenuLink({
  href,
  icon: Icon,
  children,
  className,
}: {
  href: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Menu.LinkItem closeOnClick render={<Link href={href} />} className={cn(ITEM_CLASS, className)}>
      <Icon className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{children}</span>
    </Menu.LinkItem>
  );
}

/**
 * Menu tài khoản trên header. Dựng thẳng từ base-ui `Menu` (điều hướng bàn
 * phím, Esc, bấm ra ngoài để đóng có sẵn) + Framer Motion cho animation:
 * open được điều khiển ở đây để AnimatePresence giữ popup lại chạy hiệu ứng
 * đóng trước khi Portal (keepMounted) ẩn hẳn.
 */
export function AccountMenu({ user }: { user: AuthUser }) {
  const router = useRouter();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [open, setOpen] = useState(false);
  const verified = isIdentityVerified(user);
  const isBackOffice = user.role === "admin" || user.role === "staff";
  const role = ROLE_LABEL[user.role];

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      clearAuth();
      toast.success("Đã đăng xuất");
      router.push("/");
    },
  });

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        data-account-menu-trigger
        aria-label={`Menu tài khoản của ${user.name}`}
        className="group flex h-10 items-center gap-1.5 rounded-full p-0.5 pr-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted/60"
      >
        <UserAvatar name={user.name} src={user.avatarUrl} />
        <ChevronDown
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-data-popup-open:rotate-180"
        />
      </Menu.Trigger>

      <AnimatePresence>
        {open && (
          <Menu.Portal keepMounted>
            <Menu.Positioner align="end" sideOffset={10} className="z-50 outline-none">
              <Menu.Popup
                render={
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  />
                }
                className="w-[280px] max-w-[calc(100vw-1.5rem)] origin-(--transform-origin) overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-black/40 outline-none"
              >
                <div className="flex items-center gap-3 border-b border-border bg-gradient-to-br from-primary/10 to-transparent px-4 py-4">
                  <UserAvatar name={user.name} src={user.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold" title={user.name}>
                      {user.name}
                    </p>
                    <p className="truncate text-[13px] text-muted-foreground" title={user.email}>
                      {user.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", role.className)}>
                    {role.label}
                  </span>
                  <Menu.LinkItem
                    closeOnClick
                    render={<Link href="/profile#kyc-verification" />}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium outline-none transition-colors data-highlighted:ring-2 data-highlighted:ring-ring/60",
                      verified
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25",
                    )}
                  >
                    {verified ? (
                      <ShieldCheck className="size-3.5" aria-hidden />
                    ) : (
                      <ShieldAlert className="size-3.5" aria-hidden />
                    )}
                    {verified ? "Đã xác thực" : "Chưa xác thực"}
                  </Menu.LinkItem>
                </div>

                <div className="flex flex-col gap-0.5 p-2">
                  {isBackOffice && (
                    <MenuLink
                      href="/admin"
                      icon={LayoutDashboard}
                      className="mb-1 bg-primary/10 text-primary data-highlighted:bg-primary/20 data-highlighted:text-primary [&_svg]:text-primary"
                    >
                      Trang quản trị
                    </MenuLink>
                  )}
                  <MenuLink href="/profile" icon={UserRound}>
                    Tài khoản của tôi
                  </MenuLink>
                  <MenuLink href="/bookings" icon={Ticket}>
                    Đơn thuê của tôi
                  </MenuLink>
                  <MenuLink href="/notifications" icon={Bell}>
                    Thông báo
                  </MenuLink>
                  <MenuLink href="/profile#kyc-verification" icon={ShieldCheck}>
                    Xác thực danh tính
                  </MenuLink>
                </div>

                <div className="border-t border-border p-2">
                  <Menu.Item
                    disabled={logoutMutation.isPending}
                    onClick={() => logoutMutation.mutate()}
                    className={cn(
                      ITEM_CLASS,
                      "text-red-400 data-highlighted:bg-red-500/10 data-highlighted:text-red-300 data-disabled:opacity-50",
                    )}
                  >
                    <LogOut className="size-[18px] shrink-0" aria-hidden />
                    Đăng xuất
                  </Menu.Item>
                </div>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        )}
      </AnimatePresence>
    </Menu.Root>
  );
}
