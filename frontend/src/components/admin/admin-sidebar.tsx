"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Tags,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logoutRequest } from "@/lib/auth-api";
import { useAuthStore, type AuthUser } from "@/stores/auth-store";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/devices", label: "Thiết bị", icon: Package },
  { href: "/admin/categories", label: "Danh mục", icon: Tags },
  { href: "/admin/bookings", label: "Đơn thuê", icon: ClipboardList },
  { href: "/admin/maintenance", label: "Bảo trì", icon: Wrench },
  { href: "/admin/users", label: "Người dùng", icon: Users, adminOnly: true },
];

function initialsOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function AdminSidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      clearAuth();
      toast.success("Đã đăng xuất");
      router.push("/");
    },
  });

  const items = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user.role === "admin",
  );

  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col border-r border-border/60 bg-card/40 lg:w-60">
      <div className="flex h-14 shrink-0 items-center justify-center gap-2 border-b border-border/60 px-2 font-heading text-lg font-semibold tracking-tight lg:justify-start lg:px-4">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          T
        </span>
        <span className="hidden lg:inline">
          Tech<span className="text-primary">Rent</span>
        </span>
        <span className="ml-auto hidden rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground lg:inline">
          Admin
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2 lg:p-3">
        {items.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const link = (
            <Link
              href={item.href}
              className={cn(
                "relative flex items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:justify-start",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
              )}
              <Icon className="size-[1.1rem] shrink-0" strokeWidth={2} />
              <span className="hidden truncate lg:inline">{item.label}</span>
            </Link>
          );
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger render={<span className="block lg:hidden" />}>
                {link}
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
              <span className="hidden lg:block">{link}</span>
            </Tooltip>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-border/60 p-2.5 lg:p-3">
        <Avatar className="size-9 shrink-0">
          <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
        </Avatar>
        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.role === "admin" ? "Quản trị viên" : "Nhân viên"}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger render={<span className="ml-auto lg:ml-0" />}>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
              aria-label="Đăng xuất"
            >
              <LogOut className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Đăng xuất</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
