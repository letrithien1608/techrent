import { api } from "./api-client";
import type { AuthResponse } from "./auth-api";
import type { AuthUser } from "@/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type SocialProvider = "google" | "facebook";

export const SOCIAL_PROVIDER_LABEL: Record<SocialProvider, string> = {
  google: "Google",
  facebook: "Facebook",
};

/** Trang cần quay lại sau khi đăng nhập bằng mạng xã hội (đi vòng qua Google/Facebook nên không giữ được query `?redirect=`). */
export const SOCIAL_REDIRECT_KEY = "techrent-social-redirect";

/** Provider đang bật ở backend (đủ biến môi trường) — chỉ hiện nút của các provider này. */
export async function fetchSocialProviders(): Promise<SocialProvider[]> {
  const { data } = await api.get<{ providers: SocialProvider[] }>("/auth/social/providers");
  return data.providers;
}

/** Điều hướng cả trang tới đây (backend tạo state chống CSRF rồi chuyển sang Google/Facebook). */
export function socialStartUrl(provider: SocialProvider): string {
  return `${API_URL}/auth/${provider}/start`;
}

export async function exchangeSocialCode(code: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/social/exchange", { code });
  return data;
}

export interface SocialTicket {
  provider: SocialProvider;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export async function fetchSocialTicket(ticket: string): Promise<SocialTicket> {
  const { data } = await api.get<SocialTicket>(`/auth/social/ticket/${encodeURIComponent(ticket)}`);
  return data;
}

export interface SocialRegisterPayload {
  ticket: string;
  name: string;
  email?: string;
  phone: string;
  cccd: string;
  acceptTerms: boolean;
}

export async function socialRegisterRequest(payload: SocialRegisterPayload): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/social/register", payload);
  return data;
}

export interface SocialAccountsOverview {
  hasPassword: boolean;
  accounts: Array<{ provider: SocialProvider; email: string | null; createdAt: string }>;
}

export async function fetchSocialAccounts(): Promise<SocialAccountsOverview> {
  const { data } = await api.get<SocialAccountsOverview>("/auth/social/accounts");
  return data;
}

/** Trả URL Google/Facebook (state gắn với tài khoản đang đăng nhập) để trình duyệt chuyển tới. */
export async function startSocialLink(provider: SocialProvider): Promise<string> {
  const { data } = await api.post<{ url: string }>(`/auth/social/${provider}/link`);
  return data.url;
}

export async function unlinkSocialAccount(provider: SocialProvider): Promise<void> {
  await api.delete(`/auth/social/accounts/${provider}`);
}

export async function setPasswordRequest(newPassword: string): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>("/auth/set-password", { newPassword });
  return data;
}
