import { api } from "./api-client";

export interface OwnReview {
  id: string;
  bookingId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Kiểm tra 1 booking đã được đánh giá chưa — trả `null` nếu chưa có review nào. */
export async function fetchReviewByBookingId(
  bookingId: string,
): Promise<OwnReview | null> {
  const { data } = await api.get<{ data: OwnReview[] }>("/reviews", {
    params: { bookingId, limit: 1 },
  });
  return data.data[0] ?? null;
}

export interface CreateReviewPayload {
  bookingId: string;
  rating: number;
  comment?: string;
}

export async function createReview(
  payload: CreateReviewPayload,
): Promise<OwnReview> {
  const { data } = await api.post<OwnReview>("/reviews", payload);
  return data;
}
