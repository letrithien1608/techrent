"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarDays, Ticket } from "lucide-react";
import { fetchBookings } from "@/lib/bookings-api";
import { useAuthStore } from "@/stores/auth-store";

function formatJoinDate(value: string): string {
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function AccountOverviewSection() {
  const user = useAuthStore((state) => state.user);

  // Chỉ cần `meta.total`, không cần dữ liệu — xin limit=1 cho nhẹ, giống
  // cách trang chủ lấy tổng số thiết bị thật (fetchDevices({limit:1})).
  const bookingsQuery = useQuery({
    queryKey: ["profile", "bookings-count"],
    queryFn: () => fetchBookings({ limit: 1 }),
  });

  if (!user) return null;

  const totalBookings = bookingsQuery.data?.meta.total;

  return (
    <motion.section
      id="overview"
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-8"
    >
      <h2 className="font-heading text-xl font-semibold">
        Tổng quan tài khoản
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-6">
        <div className="text-center">
          <Ticket className="mx-auto mb-2 size-5 text-primary" />
          <p className="font-heading text-3xl font-bold tracking-tight">
            {bookingsQuery.isPending
              ? "—"
              : (totalBookings ?? 0)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Lượt đặt thuê</p>
        </div>
        <div className="text-center">
          <CalendarDays className="mx-auto mb-2 size-5 text-primary" />
          <p className="font-heading text-lg font-bold tracking-tight sm:text-xl">
            {user.createdAt ? formatJoinDate(user.createdAt) : "—"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">Ngày tham gia</p>
        </div>
      </div>
    </motion.section>
  );
}
