import { api } from "./api-client";

export const REVIEW_COMMENT_MIN = 10;
export const REVIEW_COMMENT_MAX = 1000;

export interface OwnReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
  isHidden: boolean;
  hiddenReason: string | null;
}

export interface ReviewEligibility {
  canReview: boolean;
  reason: "not_rented" | "blacklisted" | null;
  review: OwnReview | null;
}

export const INELIGIBLE_MESSAGE: Record<NonNullable<ReviewEligibility["reason"]>, string> = {
  not_rented: "Bạn cần thuê và trả thiết bị này để đánh giá",
  blacklisted: "Tài khoản của bạn đang bị hạn chế nên không thể đánh giá",
};

/** Quyền đánh giá của người đang đăng nhập + đánh giá cũ của họ cho thiết bị. */
export async function fetchMyReview(deviceId: string): Promise<ReviewEligibility> {
  const { data } = await api.get<ReviewEligibility>("/reviews/me", { params: { deviceId } });
  return data;
}

export interface ReviewPayload {
  rating: number;
  comment: string;
}

export async function createReview(deviceId: string, payload: ReviewPayload) {
  const { data } = await api.post("/reviews", { deviceId, ...payload });
  return data;
}

export async function updateReview(reviewId: string, payload: ReviewPayload) {
  const { data } = await api.patch(`/reviews/${reviewId}`, payload);
  return data;
}

export async function deleteReview(reviewId: string): Promise<void> {
  await api.delete(`/reviews/${reviewId}`);
}

// ---- Quản trị ----

export interface AdminReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  editedAt: string | null;
  isHidden: boolean;
  hiddenReason: string | null;
  hiddenAt: string | null;
  user: { id: string; name: string; email: string };
  device: { id: string; name: string; images: string[] };
  booking: { id: string; endTime: string };
}

export interface AdminReviewsParams {
  page?: number;
  limit?: number;
  rating?: number;
  hidden?: boolean;
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
