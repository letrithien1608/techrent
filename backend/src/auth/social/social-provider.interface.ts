import { SocialProvider } from '../../generated/prisma/client';

/** Danh tính lấy từ Google/Facebook sau khi đổi `code` lấy access token. */
export interface SocialProfile {
  /** Định danh bất biến của provider (Google `sub`, Facebook `id`) — KHÔNG dùng email làm khoá. */
  providerUserId: string;
  email: string | null;
  /** `true` chỉ khi provider xác nhận email thuộc về người này. */
  emailVerified: boolean;
  name: string | null;
}

/**
 * Mỗi mạng xã hội là 1 class cài interface này + đăng ký vào
 * `SOCIAL_OAUTH_PROVIDERS` (xem `social-auth.module` trong `auth.module.ts`).
 * Thêm provider mới (VD Zalo) = thêm 1 giá trị enum `SocialProvider` + 1 class
 * — `SocialAuthService`/controller/frontend không phải sửa.
 */
export interface SocialOAuthProvider {
  readonly name: SocialProvider;
  /** `false` khi thiếu biến môi trường — provider tắt, nút không hiện. */
  isEnabled(): boolean;
  buildAuthorizationUrl(state: string): string;
  /** Đổi `code` lấy access token rồi đọc hồ sơ. Ném `SocialProviderError` khi provider lỗi. */
  fetchProfile(code: string): Promise<SocialProfile>;
}

export const SOCIAL_OAUTH_PROVIDERS = Symbol('SOCIAL_OAUTH_PROVIDERS');

/** Lỗi khi gọi provider — KHÔNG chứa secret/token, chỉ mô tả + mã HTTP để log. */
export class SocialProviderError extends Error {}

/** Mọi lệnh gọi ra Google/Facebook đều có timeout (quy tắc mục 2 CLAUDE.md). */
export const SOCIAL_HTTP_TIMEOUT_MS = 10_000;

export async function fetchJson<T>(
  url: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(SOCIAL_HTTP_TIMEOUT_MS),
    });
  } catch {
    throw new SocialProviderError(`${label}: không kết nối được`);
  }
  if (!response.ok) {
    throw new SocialProviderError(`${label}: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}
