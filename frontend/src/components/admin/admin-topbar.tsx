"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

function resolveBreadcrumb(pathname: string): Crumb[] {
  if (pathname === "/admin") return [{ label: "Tổng quan" }];
  if (pathname === "/admin/devices/new") {
    return [{ label: "Thiết bị", href: "/admin/devices" }, { label: "Thêm thiết bị" }];
  }
  if (/^\/admin\/devices\/[^/]+\/edit$/.test(pathname)) {
    return [{ label: "Thiết bị", href: "/admin/devices" }, { label: "Sửa thiết bị" }];
  }
  if (pathname.startsWith("/admin/devices")) return [{ label: "Thiết bị" }];
  if (pathname.startsWith("/admin/categories")) return [{ label: "Danh mục" }];
  if (pathname.startsWith("/admin/bookings")) return [{ label: "Đơn thuê" }];
  if (pathname.startsWith("/admin/maintenance")) return [{ label: "Bảo trì" }];
  if (pathname.startsWith("/admin/users")) return [{ label: "Người dùng" }];
  if (pathname.startsWith("/admin/blacklist")) return [{ label: "Danh sách đen" }];
  return [{ label: "Admin" }];
}

export function AdminTopbar() {
  const pathname = usePathname();
  const crumbs = resolveBreadcrumb(pathname ?? "");
  const current = crumbs[crumbs.length - 1];

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/60 px-4 backdrop-blur-sm sm:px-6">
      <nav className="flex min-w-0 items-center gap-1.5 text-lg font-heading font-semibold tracking-tight">
        {crumbs.slice(0, -1).map((crumb) => (
          <span key={crumb.href} className="flex items-center gap-1.5">
            <Link
              href={crumb.href ?? "#"}
              className="truncate text-muted-foreground transition-colors hover:text-foreground"
            >
              {crumb.label}
            </Link>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
          </span>
        ))}
        <h1 className="truncate">{current.label}</h1>
      </nav>
    </header>
  );
}
