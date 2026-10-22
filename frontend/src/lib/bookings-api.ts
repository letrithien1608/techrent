import { api } from "./api-client";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "ongoing"
  | "completed"
  | "cancelled";

export interface BookingDeviceSummary {
  id: string;
  name: string;
  images: string[];
  categoryId: string;
}

export interface Booking {
  id: string;
  userId: string;
  deviceId: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  totalPrice: string;
  depositAmount: string;
  createdAt: string;
  /** Bản MASKED CCCD, tự sinh khi booking chuyển `confirmed` — `null` trước đó. */
  contractContent?: string | null;
  contractSigned?: boolean;
  contractSignedAt?: string | null;
  /** Chỉ có ở `GET /bookings` và `GET /bookings/:id` (BookingsService trả kèm include) */
  device?: BookingDeviceSummary;
}

export interface BookingContract {
  content: string;
  signed: boolean;
  signedAt: string | null;
}

export const BOOKING_TTL_MINUTES = 5;

export interface PaginatedBookings {
  data: Booking[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CancelBookingResult {
  booking: Booking;
  refundPercentage: number;
  refundAmount: string;
}

export async function checkAvailability(
  deviceId: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const { data } = await api.get<{ available: boolean }>(
    "/bookings/availability",
    { params: { deviceId, startTime, endTime } },
  );
  return data.available;
}

export async function createBooking(
  deviceId: string,
  startTime: string,
  endTime: string,
): Promise<Booking> {
  const { data } = await api.post<Booking>("/bookings", {
    deviceId,
    startTime,
    endTime,
  });
  return data;
}

export async function fetchBookingById(id: string): Promise<Booking> {
  const { data } = await api.get<Booking>(`/bookings/${id}`);
  return data;
}

export async function fetchBookings(
  params: { page?: number; limit?: number; status?: BookingStatus } = {},
): Promise<PaginatedBookings> {
  const { data } = await api.get<PaginatedBookings>("/bookings", { params });
  return data;
}

export async function cancelBooking(
  id: string,
  reason?: string,
): Promise<CancelBookingResult> {
  const { data } = await api.patch<CancelBookingResult>(
    `/bookings/${id}/cancel`,
    { reason },
  );
  return data;
}

// ---- Staff/admin: chuyển trạng thái theo state machine (mục 3.6/Tuần 12) ----

export async function confirmBooking(id: string): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/confirm`);
  return data;
}

export async function startBooking(id: string): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/start`);
  return data;
}

export async function completeBooking(id: string): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/complete`);
  return data;
}

// ---- Staff/admin: hợp đồng thuê — xem/in (CCCD đầy đủ) + đánh dấu đã ký tay ----

export async function fetchContractForPrint(
  id: string,
): Promise<BookingContract> {
  const { data } = await api.get<BookingContract>(`/bookings/${id}/contract`);
  return data;
}

export async function setContractSigned(
  id: string,
  signed: boolean,
): Promise<Booking> {
  const { data } = await api.patch<Booking>(
    `/bookings/${id}/contract/signed`,
    { signed },
  );
  return data;
}
