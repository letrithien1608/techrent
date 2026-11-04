"use client";

import { useAuthStore } from "@/stores/auth-store";

/**
 * Nút trang chủ khi đã đăng nhập: không mời đăng ký/đăng nhập nữa. Khách →
 * "Đơn thuê của tôi", nhân viên/admin → "Trang quản trị". `loggedIn` chỉ
 * `true` sau khi đọc xong localStorage, để HTML lần đầu khớp phía server.
 */
export function useSignedInCta() {
  const user = useAuthStore((s) => (s.hasHydrated ? s.user : null));
  const secondary =
    user && user.role !== "customer"
      ? { href: "/admin", label: "Trang quản trị" }
      : { href: "/bookings", label: "Đơn thuê của tôi" };
  return { loggedIn: !!user, secondary };
}
