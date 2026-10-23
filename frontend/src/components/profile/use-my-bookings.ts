"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBookings, type Booking } from "@/lib/bookings-api";

/** Tối đa backend cho phép mỗi trang — đủ cho thống kê cá nhân của 1 khách. */
const LIMIT = 100;
const DUE_SOON_MS = 24 * 3600 * 1000;

export type BookingAlert = { booking: Booking; kind: "overdue" | "due-soon" };

/** Dùng chung 1 query cho thẻ đầu trang và mục Tổng quan (cùng queryKey → 1 lần gọi API). */
export function useMyBookings(enabled: boolean) {
  return useQuery({
    queryKey: ["profile", "bookings"],
    queryFn: () => fetchBookings({ limit: LIMIT }),
    enabled,
    staleTime: 30_000,
  });
}

export function summarizeBookings(bookings: Booking[], now = Date.now()) {
  const ongoing = bookings.filter((b) => b.status === "ongoing");
  const totalSpent = bookings
    .filter((b) => b.status === "completed" || b.status === "ongoing")
    .reduce((sum, b) => sum + Number(b.totalPrice), 0);
  const alerts: BookingAlert[] = ongoing
    .map((booking) => {
      const end = new Date(booking.endTime).getTime();
      if (end < now) return { booking, kind: "overdue" as const };
      if (end - now <= DUE_SOON_MS) return { booking, kind: "due-soon" as const };
      return null;
    })
    .filter((a): a is BookingAlert => a !== null);
  return { ongoingCount: ongoing.length, totalSpent, alerts };
}
