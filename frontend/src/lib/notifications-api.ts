import { api } from "./api-client";
import type { BookingStatus } from "./bookings-api";

/**
 * Dữ liệu chi tiết đi kèm thông báo (backend dựng ở notification-templates.ts).
 * Mọi trường đều tuỳ chọn — thông báo cũ (trước khi có cột metadata) là `{}`.
 */
export interface NotificationMetadata {
  bookingId?: string;
  bookingCode?: string;
  deviceId?: string;
  deviceName?: string;
  deviceImage?: string | null;
  customerName?: string;
  startTime?: string;
  endTime?: string;
  totalPrice?: number;
  depositAmount?: number;
  refundPercentage?: number;
  refundAmount?: number;
  reason?: string;
  maintenanceId?: string;
  issue?: string;
  reporterName?: string;
}

/** Trạng thái THẬT hiện tại của đơn mà thông báo nhắc tới (backend gắn lúc đọc danh sách). */
export interface NotificationBookingState {
  status: BookingStatus;
  confirmedByName: string | null;
  cancelledByName: string | null;
  cancellationReason: string | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string | null;
  message: string;
  link: string | null;
  metadata: NotificationMetadata;
  isRead: boolean;
  createdAt: string;
  bookingState?: NotificationBookingState | null;
}

export interface PaginatedNotifications {
  data: AppNotification[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface NotificationQuery {
  page?: number;
  limit?: number;
  isRead?: boolean;
  types?: string[];
}

export async function fetchNotifications(
  { types, ...params }: NotificationQuery = {},
): Promise<PaginatedNotifications> {
  const { data } = await api.get<PaginatedNotifications>("/notifications", {
    params: { ...params, ...(types?.length ? { types: types.join(",") } : {}) },
  });
  return data;
}

export async function markNotificationAsRead(id: string): Promise<AppNotification> {
  const { data } = await api.patch<AppNotification>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsAsRead(): Promise<{ count: number }> {
  const { data } = await api.patch<{ count: number }>("/notifications/read-all");
  return data;
}

export async function deleteNotification(id: string): Promise<void> {
  await api.delete(`/notifications/${id}`);
}
