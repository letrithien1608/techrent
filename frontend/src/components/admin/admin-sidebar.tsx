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
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border/60 bg-card/40">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-4 font-heading text-lg font-semibold tracking-tight">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          T
        </span>
        Tech<span className="text-primary">Rent</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
          Admin
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-border/60 p-3">
        <Avatar className="size-9">
          <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.role === "admin" ? "Quản trị viên" : "Nhân viên"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
          aria-label="Đăng xuất"
        >
          <LogOut className="size-4" />
        </Button>
      </div>
    </aside>
  );
}
