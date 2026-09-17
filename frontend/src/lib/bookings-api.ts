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
  /** Chỉ có ở `GET /bookings` và `GET /bookings/:id` (BookingsService trả kèm include) */
  device?: BookingDeviceSummary;
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
