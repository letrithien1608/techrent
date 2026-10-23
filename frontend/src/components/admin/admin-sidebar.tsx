"use client";

import type { AuthUser } from "@/stores/auth-store";
import { AdminAccountMenu, AdminLogo, AdminNavLinks, BackToSiteLink } from "./admin-nav";

/**
 * Sidebar quản trị cho máy tính/tablet: rail chỉ icon ở md, đầy đủ nhãn từ lg.
 * Điện thoại (< md) dùng ngăn kéo mở bằng nút ☰ ở topbar (AdminMobileNav).
 * Logo và mục "Về trang chủ" luôn có — lối thoát khỏi khu quản trị.
 */
export function AdminSidebar({ user }: { user: AuthUser }) {
  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/60 bg-card/40 md:flex md:w-16 lg:w-60">
      <div className="flex h-14 shrink-0 items-center justify-center border-b border-border/60 px-2 lg:justify-between lg:px-4">
        <span className="lg:hidden">
          <AdminLogo compact />
        </span>
        <span className="hidden lg:block">
          <AdminLogo />
        </span>
        <span className="hidden rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground lg:inline">Quản trị</span>
      </div>

      <nav aria-label="Điều hướng quản trị" className="scrollbar-thin flex flex-1 flex-col gap-1 overflow-y-auto p-2 lg:p-3">
        <div className="contents lg:hidden">
          <AdminNavLinks user={user} compact />
        </div>
        <div className="hidden lg:contents">
          <AdminNavLinks user={user} />
        </div>
      </nav>

      <div className="flex flex-col gap-2 border-t border-border/60 p-2 lg:p-3">
        <div className="lg:hidden">
          <BackToSiteLink compact />
        </div>
        <div className="hidden lg:block">
          <BackToSiteLink />
        </div>
        <div className="flex justify-center lg:hidden">
          <AdminAccountMenu user={user} compact />
        </div>
        <div className="hidden lg:block">
          <AdminAccountMenu user={user} />
        </div>
      </div>
    </aside>
  );
}
