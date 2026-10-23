"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/auth-store";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  const isAllowed = !!user && user.role !== "customer";

  useEffect(() => {
    if (hasHydrated && !isAllowed) {
      // Chỉ chặn người KHÔNG đủ quyền; admin rời /admin bình thường (không ép ở lại).
      router.replace("/");
    }
  }, [hasHydrated, isAllowed, router]);

  if (!hasHydrated || !isAllowed || !user) {
    return null;
  }

  return (
    <TooltipProvider delay={200}>
      <div className="flex min-h-screen w-full flex-1">
        <div className="print:hidden">
          <AdminSidebar user={user} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="print:hidden">
            {/* AdminTopbar đọc ?bookingId= (useSearchParams) cho breadcrumb — bắt buộc bọc Suspense. */}
            <Suspense fallback={<div className="h-14 border-b border-border/60" />}>
              <AdminTopbar user={user} />
            </Suspense>
          </div>
          <main className="flex-1 overflow-y-auto bg-background px-4 py-6 sm:px-6 print:p-0">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
