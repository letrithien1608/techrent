"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/stores/auth-store";
import { AdminAccountMenu } from "./admin-nav";
import { AdminMobileNav } from "./admin-mobile-nav";

interface Crumb {
  label: string;
  href?: string;
}

const ROOT: Crumb = { label: "Quản trị", href: "/admin" };

const SECTION_LABEL: [prefix: string, label: string][] = [
  ["/admin/devices", "Thiết bị"],
  ["/admin/categories", "Danh mục"],
  ["/admin/bookings", "Đơn thuê"],
  ["/admin/reviews", "Đánh giá"],
  ["/admin/maintenance", "Bảo trì"],
  ["/admin/users", "Người dùng"],
  ["/admin/blacklist", "Danh sách đen"],
  ["/admin/refunds", "Hoàn cọc"],
  ["/admin/issues", "Báo lỗi thiết bị"],
  ["/admin/debts", "Công nợ"],
];

/** "Quản trị › Đơn thuê › Chi tiết đơn" — suy ra từ đường dẫn (và ?bookingId= khi mở chi tiết đơn). */
export function resolveBreadcrumb(pathname: string, bookingId: string | null): Crumb[] {
  if (pathname === "/admin") return [{ label: "Quản trị" }, { label: "Tổng quan" }];
  const section = SECTION_LABEL.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!section) return [ROOT];
  const [prefix, label] = section;
  const sectionCrumb = { label, href: prefix };

  const contract = /^\/admin\/bookings\/([^/]+)\/contract$/.exec(pathname);
  if (contract) {
    return [
      ROOT,
      sectionCrumb,
      { label: `Đơn #${contract[1].slice(0, 8).toUpperCase()}`, href: `/admin/bookings?bookingId=${contract[1]}` },
      { label: "Hợp đồng" },
    ];
  }
  if (pathname === "/admin/bookings" && bookingId) {
    return [ROOT, sectionCrumb, { label: `Chi tiết đơn #${bookingId.slice(0, 8).toUpperCase()}` }];
  }
  if (pathname === "/admin/devices/new") return [ROOT, sectionCrumb, { label: "Thêm thiết bị" }];
  if (/^\/admin\/devices\/[^/]+\/edit$/.test(pathname)) return [ROOT, sectionCrumb, { label: "Sửa thiết bị" }];
  return [ROOT, { label }];
}

export function AdminTopbar({ user }: { user: AuthUser }) {
  const pathname = usePathname() ?? "";
  const bookingId = useSearchParams().get("bookingId");
  const crumbs = resolveBreadcrumb(pathname, bookingId);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-md sm:px-6">
      <AdminMobileNav user={user} />
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-[15px]">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={`${crumb.label}-${index}`} className={`flex min-w-0 items-center gap-1.5 ${!last && index < crumbs.length - 2 ? "hidden sm:flex" : ""}`}>
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="truncate text-muted-foreground transition-colors hover:text-foreground">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className="truncate font-heading font-semibold">
                    {crumb.label}
                  </span>
                )}
                {!last && <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </nav>
      <Button variant="ghost" className="h-9 shrink-0 gap-1.5 px-2.5 sm:px-3" nativeButton={false} render={<Link href="/" />}>
        <Home className="size-4" />
        <span className="hidden sm:inline">Về trang chủ</span>
        <span className="sr-only sm:hidden">Về trang chủ</span>
      </Button>
      <div className="md:hidden">
        <AdminAccountMenu user={user} compact />
      </div>
    </header>
  );
}
