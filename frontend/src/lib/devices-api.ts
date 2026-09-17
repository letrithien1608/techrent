const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type DeviceStatus = "available" | "rented" | "maintenance" | "broken";
export type DeviceSort = "newest" | "price_asc" | "price_desc";

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

export interface Category {
  id: string;
  name: string;
  description?: string | null;
}

export interface Review {
  id: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  booking: { user: { name: string } };
}

export interface PaginatedReviews {
  data: Review[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface FetchReviewsResult {
  result: PaginatedReviews | null;
  hasError: boolean;
}

export interface FetchDevicesParams {
  page?: number;
  limit?: number;
  categoryId?: string;
  status?: DeviceStatus;
  sort?: DeviceSort;
  search?: string;
}

/**
 * Fetch trực tiếp (không qua axios) — dùng được cả trong Server Component (SSR)
 * lẫn Client Component. Endpoint `/devices` là public, không cần token.
 */
export async function fetchDevices(
  params: FetchDevicesParams = {},
): Promise<FetchDevicesResult> {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.categoryId) search.set("categoryId", params.categoryId);
  if (params.status) search.set("status", params.status);
  if (params.sort) search.set("sort", params.sort);
  if (params.search) search.set("search", params.search);

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

export async function fetchDevice(id: string): Promise<Device | null> {
  try {
    const res = await fetch(`${API_URL}/devices/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Device;
  } catch {
    return null;
  }
}

export async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_URL}/categories`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Category[];
  } catch {
    return [];
  }
}

export async function fetchReviews(
  deviceId: string,
  params: { page?: number; limit?: number } = {},
): Promise<FetchReviewsResult> {
  const search = new URLSearchParams({ deviceId });
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));

  try {
    const res = await fetch(`${API_URL}/reviews?${search.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = (await res.json()) as PaginatedReviews;
    return { result, hasError: false };
  } catch {
    return { result: null, hasError: true };
  }
}
