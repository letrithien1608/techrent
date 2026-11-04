"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Menu } from "@base-ui/react/menu";
import {
  Banknote,
  HandCoins,
  TriangleAlert,
  ChevronsUpDown,
  ClipboardList,
  Home,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Package,
  ShieldAlert,
  Tags,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { UserAvatar } from "@/components/account/user-avatar";
import { logoutRequest } from "@/lib/auth-api";
import { ROLE_LABEL } from "@/lib/user-format";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/admin/devices", label: "Thiết bị", icon: Package },
  { href: "/admin/categories", label: "Danh mục", icon: Tags },
  { href: "/admin/bookings", label: "Đơn thuê", icon: ClipboardList },
  { href: "/admin/refunds", label: "Hoàn cọc", icon: Banknote },
  { href: "/admin/issues", label: "Báo lỗi", icon: TriangleAlert },
  { href: "/admin/debts", label: "Công nợ", icon: HandCoins },
  { href: "/admin/reviews", label: "Đánh giá", icon: MessageSquareText },
  { href: "/admin/maintenance", label: "Bảo trì", icon: Wrench },
  { href: "/admin/users", label: "Người dùng", icon: Users, adminOnly: true },
  { href: "/admin/blacklist", label: "Danh sách đen", icon: ShieldAlert, adminOnly: true },
];

export function visibleAdminItems(user: AuthUser): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => !item.adminOnly || user.role === "admin");
}

export function isAdminItemActive(pathname: string | null, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}

/** Logo bấm được — luôn đưa về trang chủ khách hàng (lối thoát khỏi khu quản trị). */
export function AdminLogo({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label="TechRent — về trang chủ"
      className="flex items-center gap-2 rounded-lg font-heading text-lg font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">T</span>
      {!compact && (
        <span>
          Tech<span className="text-primary">Rent</span>
        </span>
      )}
    </Link>
  );
}

const MENU_ITEM =
  "flex h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground/90 outline-none data-highlighted:bg-muted";

/** Menu tài khoản trong khu quản trị: Trang chủ / Tài khoản của tôi / Đăng xuất. */
export function AdminAccountMenu({ user, compact = false }: { user: AuthUser; compact?: boolean }) {
  const router = useRouter();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const logout = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      clearAuth();
      toast.success("Đã đăng xuất");
      router.push("/");
    },
  });

  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Menu tài khoản của ${user.name}`}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted/60",
          compact && "w-auto justify-center",
        )}
      >
        <UserAvatar name={user.name} src={user.avatarUrl} size="md" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{ROLE_LABEL[user.role].label}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side={compact ? "bottom" : "top"} align={compact ? "end" : "start"} sideOffset={8} className="z-[70] outline-none">
          <Menu.Popup className="w-60 origin-(--transform-origin) rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl shadow-black/40 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
            <div className="border-b border-border px-3 pt-1 pb-2.5">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>
            </div>
            <div className="flex flex-col gap-0.5 py-1.5">
              <Menu.LinkItem closeOnClick render={<Link href="/" />} className={MENU_ITEM}>
                <Home className="size-[18px] text-muted-foreground" aria-hidden />
                Trang chủ
              </Menu.LinkItem>
              <Menu.LinkItem closeOnClick render={<Link href="/profile" />} className={MENU_ITEM}>
                <UserRound className="size-[18px] text-muted-foreground" aria-hidden />
                Tài khoản của tôi
              </Menu.LinkItem>
            </div>
            <div className="border-t border-border pt-1.5">
              <Menu.Item
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
                className={cn(MENU_ITEM, "text-red-400 data-highlighted:bg-red-500/10")}
              >
                <LogOut className="size-[18px]" aria-hidden />
                Đăng xuất
              </Menu.Item>
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Danh sách mục điều hướng + "Về trang chủ" — dùng chung sidebar desktop và ngăn kéo điện thoại. */
export function AdminNavLinks({
  user,
  compact = false,
  onNavigate,
}: {
  user: AuthUser;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const linkClass = (active: boolean) =>
    cn(
      "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
      compact && "justify-center px-0",
      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );
  return (
    <>
      {visibleAdminItems(user).map((item) => {
        const active = isAdminItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={compact ? item.label : undefined}
            className={linkClass(active)}
          >
            {active && <span className="absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />}
            <item.icon className="size-[18px] shrink-0" aria-hidden />
            {compact ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </>
  );
}

export function BackToSiteLink({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onNavigate}
      title={compact ? "Về trang chủ" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg border border-border/60 px-3 text-sm font-medium text-foreground/85 outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50",
        compact && "justify-center px-0",
      )}
    >
      <Home className="size-[18px] shrink-0" aria-hidden />
      {compact ? <span className="sr-only">Về trang chủ</span> : "Về trang chủ"}
    </Link>
  );
}
