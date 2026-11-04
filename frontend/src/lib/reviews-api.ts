import { api } from "./api-client";

export const REVIEW_COMMENT_MIN = 10;
export const REVIEW_COMMENT_MAX = 1000;
/** Khớp REVIEW_EDITS_PER_DAY ở backend/src/common/business-policy.ts. */
export const REVIEW_EDITS_PER_DAY = 5;

export interface OwnReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
  isHidden: boolean;
  hiddenReason: string | null;
  /** Có giá trị = đã bị nhân viên/quản trị xoá. */
  deletedAt: string | null;
  deleteReason: string | null;
  verifiedRental: boolean;
  editsLeftToday: number;
}

export type IneligibleReason = "staff" | "blacklisted" | "removed_by_moderator";

export interface MyReviewState {
  /** Chưa có đánh giá → được viết mới. */
  canCreate: boolean;
  /** Đã có đánh giá → được sửa/xoá. */
  canEdit: boolean;
  reason: IneligibleReason | null;
  review: OwnReview | null;
}

/** Đánh giá của người đang đăng nhập cho thiết bị + quyền viết/sửa. */
export async function fetchMyReview(deviceId: string): Promise<MyReviewState> {
  const { data } = await api.get<MyReviewState>(`/devices/${deviceId}/reviews/me`);
  return data;
}

export interface ReviewPayload {
  rating: number;
  comment: string;
}

export async function createReview(deviceId: string, payload: ReviewPayload) {
  const { data } = await api.post(`/devices/${deviceId}/reviews`, payload);
  return data;
}

export async function updateReview(reviewId: string, payload: ReviewPayload) {
  const { data } = await api.patch(`/reviews/${reviewId}`, payload);
  return data;
}

/** Khách tự xoá đánh giá của mình (xoá hẳn, viết lại được). */
export async function deleteReview(reviewId: string): Promise<void> {
  await api.delete(`/reviews/${reviewId}`);
}

// ---- Quản trị ----

/** Lý do gợi ý khi nhân viên/quản trị xoá đánh giá. */
export const MODERATION_REASONS = [
  "Spam",
  "Ngôn từ không phù hợp",
  "Quảng cáo",
  "Sai sự thật",
] as const;

export type AdminReviewStatus = "visible" | "hidden" | "deleted";

export interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
  isHidden: boolean;
  hiddenReason: string | null;
  hiddenAt: string | null;
  deletedAt: string | null;
  deleteReason: string | null;
  deletedBy: { id: string; name: string | null } | null;
  verifiedRental: boolean;
  user: { id: string; name: string; email: string };
  device: { id: string; name: string; images: string[] };
}

export interface AdminReviewsParams {
  page?: number;
  limit?: number;
  rating?: number;
  status?: AdminReviewStatus;
  search?: string;
}

export async function fetchAdminReviews(params: AdminReviewsParams) {
  const { data } = await api.get<{
    data: AdminReview[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }>("/reviews/admin", { params });
  return data;
}

export async function setReviewVisibility(
  reviewId: string,
  payload: { hidden: boolean; reason?: string },
): Promise<AdminReview> {
  const { data } = await api.patch<AdminReview>(`/reviews/${reviewId}/visibility`, payload);
  return data;
}

/** Nhân viên/quản trị xoá đánh giá vi phạm (xoá mềm, bắt buộc lý do). */
export async function moderatorDeleteReview(reviewId: string, reason: string): Promise<AdminReview> {
  const { data } = await api.post<AdminReview>(`/reviews/${reviewId}/moderator-delete`, { reason });
  return data;
}

/** Chỉ quản trị viên: khôi phục đánh giá bị xoá nhầm. */
export async function restoreReview(reviewId: string): Promise<AdminReview> {
  const { data } = await api.post<AdminReview>(`/reviews/${reviewId}/restore`);
  return data;
}
