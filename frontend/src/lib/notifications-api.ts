import { api } from "./api-client";

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedNotifications {
  data: AppNotification[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function fetchNotifications(
  params: { page?: number; limit?: number; isRead?: boolean } = {},
): Promise<PaginatedNotifications> {
  const { data } = await api.get<PaginatedNotifications>("/notifications", {
    params,
  });
  return data;
}

export async function markNotificationAsRead(
  id: string,
): Promise<AppNotification> {
  const { data } = await api.patch<AppNotification>(
    `/notifications/${id}/read`,
  );
  return data;
}

export async function markAllNotificationsAsRead(): Promise<{
  count: number;
}> {
  const { data } = await api.patch<{ count: number }>(
    "/notifications/read-all",
  );
  return data;
}
