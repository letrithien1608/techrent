import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type RetryableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const api = axios.create({ baseURL: API_URL });

// Instance riêng, KHÔNG gắn interceptor response ở dưới — dùng để gọi thẳng
// /auth/refresh, tránh việc chính request refresh bị 401 lại tự gọi refresh
// đệ quy vô hạn.
const refreshClient = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  }
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function flushQueue(token: string | null) {
  pendingQueue.forEach((resolve) => resolve(token));
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined;
    const isAuthEndpoint =
      originalRequest?.url?.includes("/auth/refresh") ||
      originalRequest?.url?.includes("/auth/login") ||
      originalRequest?.url?.includes("/auth/register");

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      isAuthEndpoint
    ) {
      return Promise.reject(error);
    }

    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) {
      useAuthStore.getState().clearAuth();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push((token) => {
          if (!token) {
            reject(error);
            return;
          }
          originalRequest.headers.set("Authorization", `Bearer ${token}`);
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;
    try {
      const { data } = await refreshClient.post<{
        accessToken: string;
        refreshToken: string;
      }>("/auth/refresh", { refreshToken });

      useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
      flushQueue(data.accessToken);

      originalRequest.headers.set("Authorization", `Bearer ${data.accessToken}`);
      return api(originalRequest);
    } catch (refreshError) {
      flushQueue(null);
      useAuthStore.getState().clearAuth();
      // Ngoài React render/event-handler nên không có useRouter() — hard redirect
      // là lựa chọn có chủ đích ở đây, không phải sơ suất.
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);
