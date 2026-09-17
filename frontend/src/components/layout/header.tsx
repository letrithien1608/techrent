"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useMotionValueEvent, useScroll } from "framer-motion";
import { LogOut, Ticket, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
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
  const [isScrolled, setIsScrolled] = useState(false);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 8);
  });

  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSettled: () => {
      clearAuth();
      toast.success("Đã đăng xuất");
      router.push("/");
    },
  });

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-all duration-300",
        isScrolled
          ? "border-border/60 bg-background/85 shadow-sm shadow-black/5 backdrop-blur-md"
          : "border-transparent bg-background/40 backdrop-blur-sm",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-heading text-lg font-semibold tracking-tight"
          >
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              T
            </span>
            Tech<span className="text-primary">Rent</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
            <Link
              href="/devices"
              className="text-foreground/80 transition-colors hover:text-foreground"
            >
              Thiết bị
            </Link>
          </nav>
        </div>

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
                <DropdownMenuItem render={<Link href="/bookings" />}>
                  <Ticket />
                  Đơn của tôi
                </DropdownMenuItem>
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
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                <UserIcon />
                Đăng nhập
              </Button>
              <Button size="sm" nativeButton={false} render={<Link href="/register" />}>
                Đăng ký
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
