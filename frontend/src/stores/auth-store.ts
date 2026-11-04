import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type UserRole = "customer" | "staff" | "admin";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  /** Bản che bớt (VD "********1234"), `null`/`undefined` nếu chưa bổ sung CCCD — KHÔNG BAO GIỜ có CCCD đầy đủ ở đây. */
  cccdMasked?: string | null;
  /** `true` khi ĐỦ cả 3 ảnh eKYC (CCCD mặt trước/sau + ảnh chân dung) — KHÔNG BAO GIỜ có ảnh/URL ở đây, chỉ 1 cờ boolean. */
  kycVerified?: boolean;
  emailVerifiedAt?: string | null;
  /** `false` = tài khoản đăng ký bằng Google/Facebook chưa đặt mật khẩu. */
  hasPassword?: boolean;
  createdAt?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** true sau khi zustand đọc xong localStorage ở client — dùng để tránh hydration mismatch. */
  hasHydrated: boolean;
  setAuth: (data: {
    user: AuthUser;
    accessToken: string;
    refreshToken: string;
  }) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  /** Cập nhật một phần thông tin user hiện tại (VD sau khi lưu trang /profile) — không đụng token. */
  updateUser: (patch: Partial<AuthUser>) => void;
  clearAuth: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hasHydrated: false,
      setAuth: ({ user, accessToken, refreshToken }) =>
        set({ user, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      updateUser: (patch) =>
        set((state) => (state.user ? { user: { ...state.user, ...patch } } : state)),
      clearAuth: () =>
        set({ user: null, accessToken: null, refreshToken: null }),
      setHasHydrated: (value) => set({ hasHydrated: value }),
    }),
    {
      name: "techrent-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
