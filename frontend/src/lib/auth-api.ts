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
  // Bắt buộc từ khi triển khai KYC (mục 7 Roadmap) — xem CLAUDE.md mục 2.
  phone: string;
  cccd: string;
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

/**
 * Bổ sung CCCD SAU KHI đã đăng ký (tài khoản cũ tạo trước khi có KYC, hoặc ai
 * bỏ sót lúc đăng ký). Route riêng `PATCH /auth/cccd` — backend chặn đổi lại
 * nếu đã có CCCD trong hồ sơ (400), và chặn trùng CCCD với tài khoản khác (409).
 */
export async function addCccdRequest(cccd: string): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>("/auth/cccd", { cccd });
  return data;
}

/**
 * Nộp eKYC: ảnh CCCD mặt trước + mặt sau + ảnh chân dung xác thực, nộp 1 LẦN
 * DUY NHẤT (backend chặn nộp lại nếu đã đủ — chỉ admin reset được). KHÔNG tự
 * set header `Content-Type` — để axios tự tính kèm `boundary` đúng cho
 * `FormData` (bài học cũ: set tay header multipart làm hỏng boundary, xem
 * CLAUDE.md mục "Sửa bug thật: upload ảnh lúc tạo thiết bị không hoạt động").
 */
export async function submitKycVerificationRequest(files: {
  cccdFront: File;
  cccdBack: File;
  selfie: File;
}): Promise<AuthUser> {
  const formData = new FormData();
  formData.append("cccdFront", files.cccdFront);
  formData.append("cccdBack", files.cccdBack);
  formData.append("selfie", files.selfie);
  const { data } = await api.patch<AuthUser>(
    "/auth/kyc-verification",
    formData,
  );
  return data;
}

// ---- Quên mật khẩu / đặt lại mật khẩu (public, không cần đăng nhập) ----

/**
 * Backend LUÔN trả về cùng message dù email có tồn tại hay không (tránh lộ
 * email nào đã đăng ký — xem `AuthService.forgotPassword()`) — frontend chỉ
 * cần hiện message đó, KHÔNG tự suy luận thêm trạng thái "email tồn tại".
 */
export async function forgotPasswordRequest(
  email: string,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    "/auth/forgot-password",
    { email },
  );
  return data;
}

export async function resetPasswordRequest(payload: {
  token: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(
    "/auth/reset-password",
    payload,
  );
  return data;
}

/** Hồ sơ mới nhất từ server (có thêm `isBlacklisted` mà store đăng nhập không lưu). */
export interface MyProfile extends AuthUser {
  isBlacklisted?: boolean;
  createdAt?: string;
}

export async function fetchMyProfile(): Promise<MyProfile> {
  const { data } = await api.get<MyProfile>("/auth/me");
  return data;
}
