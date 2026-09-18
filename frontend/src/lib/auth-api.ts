import { api } from "./api-client";
import type { AuthUser } from "@/stores/auth-store";

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export async function registerRequest(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/register", payload);
  return data;
}

export async function loginRequest(
  payload: LoginPayload,
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", payload);
  return data;
}

export async function logoutRequest(): Promise<void> {
  await api.post("/auth/logout");
}

// ---- Trang /profile: khách hàng tự sửa hồ sơ & đổi mật khẩu của chính mình ----

export interface UpdateProfilePayload {
  name?: string;
  phone?: string;
}

/**
 * Gọi thẳng `PATCH /users/:id` — route này CỐ Ý được backend mở cho mọi
 * role tự sửa ĐÚNG bản ghi của chính mình (xem `UsersController.update()`),
 * nhưng CHỈ chấp nhận `name`/`phone`. KHÔNG BAO GIỜ gửi kèm `role` hay
 * `password` ở đây dù kiểu `UpdateProfilePayload` không có 2 field đó nên
 * không thể vô tình gửi nhầm — đổi mật khẩu phải qua `changePasswordRequest()`.
 */
export async function updateProfileRequest(
  userId: string,
  payload: UpdateProfilePayload,
): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>(`/users/${userId}`, payload);
  return data;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export async function changePasswordRequest(
  payload: ChangePasswordPayload,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    "/auth/change-password",
    payload,
  );
  return data;
}
