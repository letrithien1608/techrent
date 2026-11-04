"use client";

import Link from "next/link";
import { CalendarDays, CircleDollarSign, PackageCheck, ShieldAlert, ShieldCheck, Ticket, UserCheck } from "lucide-react";
import { cn } from "cn";
import { AvatarEditor } from "./avatar-editor";
import { isIdentityVerified } from "@/components/account/account-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { MyProfile } from "@/lib/auth-api";
import { formatVnd } from "@/lib/device-format";
import { ROLE_LABEL } from "@/lib/user-format";
import type { AuthUser } from "@/stores/auth-store";
import { StatTile } from "./profile-shared";
import { summarizeBookings, useMyBookings } from "./use-my-bookings";

function accountStatus(user: AuthUser, profile: MyProfile | undefined) {
  if (profile?.isBlacklisted) {
    return { value: "Bị hạn chế", hint: "Liên hệ cửa hàng", tone: "bg-red-500/15 text-red-300" };
  }
  if (!isIdentityVerified(user)) {
    return { value: "Cần xác thực", hint: "Chưa thể đặt thuê", tone: "bg-amber-500/15 text-amber-300" };
  }
  return { value: "Hoạt động", hint: "Có thể đặt thuê", tone: "bg-emerald-500/15 text-emerald-300" };
}

export function ProfileHeaderCard({ user, profile }: { user: AuthUser; profile?: MyProfile }) {
  const bookingsQuery = useMyBookings(true);
  const verified = isIdentityVerified(user);
  const role = ROLE_LABEL[user.role];
  const joinedAt = profile?.createdAt ?? user.createdAt;
  const summary = bookingsQuery.data ? summarizeBookings(bookingsQuery.data.data) : null;
  const status = accountStatus(user, profile);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div className="bg-gradient-to-br from-primary/15 via-transparent to-violet-500/10 p-5 sm:p-8">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <AvatarEditor user={user} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{user.name}</h1>
            <p className="mt-1 truncate text-[15px] text-muted-foreground">{user.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
              <span className={cn("rounded-full px-2.5 py-1 font-medium", role.className)}>{role.label}</span>
              <Link
                href="#kyc-verification"
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  verified ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25",
                )}
              >
                {verified ? <ShieldCheck className="size-3.5" aria-hidden /> : <ShieldAlert className="size-3.5" aria-hidden />}
                {verified ? "Đã xác thực danh tính" : "Chưa xác thực — bấm để xác thực"}
              </Link>
              {joinedAt && (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden />
                  Tham gia {new Date(joinedAt).toLocaleDateString("vi-VN")}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-white/10 p-4 sm:p-5 xl:grid-cols-4">
        {bookingsQuery.isPending ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[74px] rounded-2xl" />)
        ) : (
          <>
            <StatTile icon={Ticket} label="Tổng số đơn" value={bookingsQuery.isError ? "—" : String(bookingsQuery.data?.meta.total ?? 0)} />
            <StatTile
              icon={PackageCheck}
              label="Đang thuê"
              value={summary ? String(summary.ongoingCount) : "—"}
              tone="bg-blue-500/15 text-blue-300"
            />
            <StatTile
              icon={CircleDollarSign}
              label="Tổng đã chi"
              value={summary ? formatVnd(summary.totalSpent) : "—"}
              hint="Đơn đang thuê và đã hoàn tất"
              tone="bg-emerald-500/15 text-emerald-300"
            />
          </>
        )}
        <StatTile icon={UserCheck} label="Trạng thái tài khoản" value={status.value} hint={status.hint} tone={status.tone} />
      </div>
    </section>
  );
}
