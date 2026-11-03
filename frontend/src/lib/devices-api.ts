const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type DeviceStatus = "available" | "rented" | "maintenance" | "broken" | "lost";
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

/** Đánh giá công khai — tên người viết đã được backend che (VD "Nguyễn V. A"). */
export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
  reviewerName: string;
  /** Luôn true: chỉ người đã thuê và trả thiết bị mới đánh giá được. */
  verifiedRental: true;
  rentedAt: string;
}

export interface FeaturedReview extends Review {
  device: { id: string; name: string; image: string | null };
}

export interface ReviewSummary {
  deviceId: string;
  avgRating: number | null;
  reviewCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export type ReviewSort = "newest" | "highest" | "lowest";

export interface PaginatedReviews {
  data: Review[];
  meta: { page: number; limit: number; total: number; totalPages: number };
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

export interface FetchReviewsParams {
  page?: number;
  limit?: number;
  sort?: ReviewSort;
  rating?: number;
}

/** Danh sách đánh giá công khai của 1 thiết bị (dùng ở client, có lọc/sắp xếp/phân trang). */
export async function fetchReviews(
  deviceId: string,
  params: FetchReviewsParams = {},
): Promise<PaginatedReviews> {
  const search = new URLSearchParams({ deviceId });
  if (params.page) search.set("page", String(params.page));
  if (params.limit) search.set("limit", String(params.limit));
  if (params.sort) search.set("sort", params.sort);
  if (params.rating) search.set("rating", String(params.rating));
  const res = await fetch(`${API_URL}/reviews?${search.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as PaginatedReviews;
}

export async function fetchReviewSummary(deviceId: string): Promise<ReviewSummary> {
  const res = await fetch(`${API_URL}/reviews/summary?deviceId=${deviceId}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as ReviewSummary;
}

/** Đánh giá tốt (4–5★) mới nhất cho trang chủ — lỗi thì trả mảng rỗng (ẩn section). */
export async function fetchFeaturedReviews(): Promise<FeaturedReview[]> {
  try {
    const res = await fetch(`${API_URL}/reviews/featured`, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as FeaturedReview[];
  } catch {
    return [];
  }
}
