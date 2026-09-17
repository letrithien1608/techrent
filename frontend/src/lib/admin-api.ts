import { api } from "./api-client";
import type { Category, Device, DeviceStatus } from "./devices-api";

// ---- Thiết bị (CRUD, admin only) ----

export interface DevicePayload {
  name: string;
  categoryId: string;
  specs?: Record<string, unknown>;
  pricePerHour: number;
  pricePerDay: number;
  status?: DeviceStatus;
}

export async function createDevice(payload: DevicePayload): Promise<Device> {
  const { data } = await api.post<Device>("/devices", payload);
  return data;
}

export async function updateDevice(
  id: string,
  payload: Partial<DevicePayload>,
): Promise<Device> {
  const { data } = await api.patch<Device>(`/devices/${id}`, payload);
  return data;
}

export async function deleteDevice(id: string): Promise<void> {
  await api.delete(`/devices/${id}`);
}

export async function uploadDeviceImages(
  id: string,
  files: File[],
): Promise<Device> {
  const formData = new FormData();
  files.forEach((file) => formData.append("images", file));
  const { data } = await api.post<Device>(`/devices/${id}/images`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ---- Danh mục (CRUD, admin only) ----

export interface CategoryPayload {
  name: string;
  description?: string;
}

export async function createCategory(
  payload: CategoryPayload,
): Promise<Category> {
  const { data } = await api.post<Category>("/categories", payload);
  return data;
}

export async function updateCategory(
  id: string,
  payload: Partial<CategoryPayload>,
): Promise<Category> {
  const { data } = await api.patch<Category>(`/categories/${id}`, payload);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`);
}

// ---- Bảo trì (staff/admin only) ----

export type MaintenanceStatus = "open" | "in_progress" | "resolved";

export interface MaintenanceRecord {
  id: string;
  deviceId: string;
  reportedBy: string;
  issue: string;
  status: MaintenanceStatus;
  resolvedAt: string | null;
}

export interface PaginatedMaintenance {
  data: MaintenanceRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function fetchMaintenance(
  params: { page?: number; limit?: number; status?: MaintenanceStatus } = {},
): Promise<PaginatedMaintenance> {
  const { data } = await api.get<PaginatedMaintenance>("/maintenance", {
    params,
  });
  return data;
}

export async function updateMaintenanceStatus(
  id: string,
  status: MaintenanceStatus,
): Promise<MaintenanceRecord> {
  const { data } = await api.patch<MaintenanceRecord>(`/maintenance/${id}`, {
    status,
  });
  return data;
}
