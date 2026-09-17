"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { useAuthStore } from "@/stores/auth-store";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  const isAllowed = !!user && user.role !== "customer";

  useEffect(() => {
    if (hasHydrated && !isAllowed) {
      router.replace("/");
    }
  }, [hasHydrated, isAllowed, router]);

  if (!hasHydrated || !isAllowed || !user) {
    return null;
  }

  return (
    <div className="flex min-h-screen w-full flex-1">
      <AdminSidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto bg-background px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
