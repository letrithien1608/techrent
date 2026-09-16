"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { LogOut, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutRequest } from "@/lib/auth-api";
import { useAuthStore } from "@/stores/auth-store";

const ROLE_LABEL: Record<string, string> = {
  customer: "Khách hàng",
  staff: "Nhân viên",
  admin: "Quản trị viên",
};

function initialsOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function Header() {
  const router = useRouter();
  const { user, hasHydrated, clearAuth } = useAuthStore();

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      clearAuth();
      toast.success("Đã đăng xuất");
      router.push("/");
    },
  });

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            T
          </span>
          Tech<span className="text-primary">Rent</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
          <Link href="/" className="transition-colors hover:text-foreground">
            Trang chủ
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {!hasHydrated ? null : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Avatar>
                  <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8}>
                <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
                  <span className="text-sm font-medium text-foreground">
                    {user.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABEL[user.role] ?? user.role}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={logoutMutation.isPending}
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" render={<Link href="/login" />}>
                <UserIcon />
                Đăng nhập
              </Button>
              <Button size="sm" render={<Link href="/register" />}>
                Đăng ký
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
