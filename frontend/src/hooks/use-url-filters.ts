"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Bộ lọc lưu trên URL (`?q=...&status=...&page=2`) — tải lại trang hoặc gửi
 * link vẫn giữ nguyên. Giá trị rỗng = mặc định (không ghi lên URL). Đổi bất
 * kỳ bộ lọc nào thì về trang 1. Bắt buộc dùng trong <Suspense> (useSearchParams).
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const values = Object.fromEntries(
    keys.map((key) => [key, searchParams.get(key) ?? ""]),
  ) as Record<K, string>;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const activeCount = keys.filter((key) => values[key] !== "").length;

  function replace(next: URLSearchParams) {
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  /** Ghi đè vài bộ lọc ("" / null = bỏ khỏi URL) và quay về trang 1. */
  function update(patch: Partial<Record<K, string | null>>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch) as [K, string | null][]) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    replace(next);
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    replace(next);
  }

  /** Bỏ hết bộ lọc của danh sách (giữ tham số khác như ?bookingId=). */
  function clear() {
    const next = new URLSearchParams(searchParams.toString());
    for (const key of keys) next.delete(key);
    next.delete("page");
    replace(next);
  }

  return { values, page, activeCount, update, setPage, clear };
}
