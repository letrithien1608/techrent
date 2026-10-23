const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type DeviceStatus = "available" | "rented" | "maintenance" | "broken";
export type DeviceSort = "newest" | "price_asc" | "price_desc";

/** 1 dòng thông số kỹ thuật có cấu trúc (khớp backend spec-sheet.util.ts). */
export interface SpecSheetEntry {
  group: string;
  label: string;
  value: string;
}

/** Mẫu thông số của 1 danh mục: các nhóm, mỗi nhóm 1 danh sách tên thông số. */
export interface SpecTemplateGroup {
  group: string;
  fields: string[];
}

export interface Device {
  id: string;
  name: string;
  categoryId: string;
  /** Dạng cũ key-value — chỉ dùng khi thiết bị chưa có `specSheet`. */
  specs: Record<string, unknown> | null;
  /** Bảng thông số theo mẫu của danh mục, đã xếp đúng thứ tự nhóm. */
  specSheet?: SpecSheetEntry[] | null;
  status: DeviceStatus;
  pricePerHour: string;
  pricePerDay: string;
  /** Giá gốc/giá trị tài sản (VNĐ) — dùng tính tiền cọc 50%, hiển thị minh bạch cho khách. */
  originalPrice: string;
  /** Mô tả dài: tình trạng máy, phụ kiện kèm theo, năm sản xuất, bảo hành — null nếu thiết bị cũ chưa có. */
  detailedDescription: string | null;
  images: string[];
  createdAt: string;
  category: { id: string; name: string };
  /** Denormalize từ Review (backend tính lại mỗi khi có review mới) — `null` nếu chưa có đánh giá nào. */
  avgRating: number | null;
  reviewCount: number;
  /** Ngừng kinh doanh — ẩn khỏi trang khách, chặn đặt mới (vẫn giữ lịch sử đơn). */
  isDiscontinued?: boolean;
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
  specTemplate?: SpecTemplateGroup[] | null;
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
  /** Chỉ trang quản trị: gồm cả thiết bị ngừng kinh doanh (trang khách luôn ẩn). */
  includeDiscontinued?: boolean;
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
  if (params.includeDiscontinued) search.set("includeDiscontinued", "true");

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

/** `activeOnly` (trang khách): chỉ danh mục còn thiết bị đang kinh doanh. */
export async function fetchCategories(
  options: { activeOnly?: boolean } = {},
): Promise<Category[]> {
  try {
    const res = await fetch(`${API_URL}/categories${options.activeOnly ? "?activeOnly=true" : ""}`, {
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
