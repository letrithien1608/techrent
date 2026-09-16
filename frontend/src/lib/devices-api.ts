const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type DeviceStatus = "available" | "rented" | "maintenance" | "broken";

export interface Device {
  id: string;
  name: string;
  categoryId: string;
  specs: Record<string, unknown> | null;
  status: DeviceStatus;
  pricePerHour: string;
  pricePerDay: string;
  images: string[];
  createdAt: string;
  category: { id: string; name: string };
}

export interface PaginatedDevices {
  data: Device[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface FetchDevicesResult {
  result: PaginatedDevices | null;
  hasError: boolean;
}

/**
 * Fetch trực tiếp (không qua axios) — dùng được cả trong Server Component (SSR)
 * lẫn Client Component. Endpoint `/devices` là public, không cần token.
 */
export async function fetchDevices(
  params: { page?: number; limit?: number } = {},
): Promise<FetchDevicesResult> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));

  try {
    const res = await fetch(`${API_URL}/devices?${search.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const result = (await res.json()) as PaginatedDevices;
    return { result, hasError: false };
  } catch {
    return { result: null, hasError: true };
  }
}
