import { api } from "./api-client";
import type { Category, Device, DeviceStatus } from "./devices-api";
import type { UserRole } from "@/stores/auth-store";

// ---- Thiết bị (CRUD, admin only) ----

export interface DevicePayload {
  name: string;
  categoryId: string;
  specs?: Record<string, unknown>;
  detailedDescription?: string;
  pricePerHour: number;
  pricePerDay: number;
  originalPrice: number;
  status?: DeviceStatus;
  images?: string[];
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
  // KHÔNG tự set Content-Type — axios/trình duyệt cần tự tính "boundary=..."
  // theo đúng nội dung FormData thật, set tay ở đây (thiếu boundary) làm
  // Multer/busboy phía backend không parse được multipart, request coi như rỗng.
  const { data } = await api.post<Device>(`/devices/${id}/images`, formData);
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

// ---- Người dùng (admin only) ----

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  /** `true` khi user đã nộp ĐỦ 3 ảnh eKYC (CCCD mặt trước/sau + ảnh chân dung). */
  kycVerified: boolean;
  emailVerifiedAt: string | null;
  createdAt: string;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  blacklistedAt: string | null;
}

export interface PaginatedUsers {
  data: AdminUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function fetchUsers(
  params: {
    page?: number;
    limit?: number;
    role?: UserRole;
    search?: string;
    isBlacklisted?: boolean;
  } = {},
): Promise<PaginatedUsers> {
  const { data } = await api.get<PaginatedUsers>("/users", { params });
  return data;
}

/** Đưa/gỡ user khỏi danh sách đen — admin only. Bắt buộc `reason` khi `blacklisted:true`. */
export async function setUserBlacklist(
  id: string,
  payload: { blacklisted: boolean; reason?: string },
): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`/users/${id}/blacklist`, payload);
  return data;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  phone?: string;
  role?: UserRole;
  password?: string;
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const { data } = await api.post<AdminUser>("/users", payload);
  return data;
}

export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<AdminUser> {
  const { data } = await api.patch<AdminUser>(`/users/${id}`, payload);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

// ---- Xem/reset ảnh eKYC (admin-only, xác minh tranh chấp thật) ----

export interface KycImage {
  slot: "cccd-front" | "cccd-back" | "selfie";
  label: string;
  /** URL ký, hết hạn sau `expiresInSeconds` — KHÔNG lưu lại/dùng lại sau khi hết hạn. */
  url: string;
}

export interface KycImagesResponse {
  submitted: boolean;
  expiresInSeconds: number;
  images: KycImage[];
}

export async function fetchKycImages(userId: string): Promise<KycImagesResponse> {
  const { data } = await api.get<KycImagesResponse>(
    `/users/${userId}/kyc-images`,
  );
  return data;
}

/** Xoá cả 3 ảnh KYC (DB + Cloudinary) để user nộp lại — dùng khi ảnh mờ/sai. */
export async function resetKycImages(userId: string): Promise<void> {
  await api.patch(`/users/${userId}/kyc-reset`);
}
