"use client";

import { usePathname } from "next/navigation";

function resolveTitle(pathname: string): string {
  if (pathname === "/admin") return "Tổng quan";
  if (pathname === "/admin/devices/new") return "Thêm thiết bị";
  if (/^\/admin\/devices\/[^/]+\/edit$/.test(pathname)) return "Sửa thiết bị";
  if (pathname.startsWith("/admin/devices")) return "Quản lý thiết bị";
  if (pathname.startsWith("/admin/categories")) return "Quản lý danh mục";
  if (pathname.startsWith("/admin/bookings")) return "Quản lý đơn thuê";
  if (pathname.startsWith("/admin/maintenance")) return "Quản lý bảo trì";
  if (pathname.startsWith("/admin/users")) return "Quản lý người dùng";
  return "Admin";
}

export function AdminTopbar() {
  const pathname = usePathname();
  const title = resolveTitle(pathname ?? "");

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border/60 bg-background/60 px-6 backdrop-blur-sm">
      <h1 className="font-heading text-lg font-semibold tracking-tight">
        {title}
      </h1>
    </header>
  );
}
