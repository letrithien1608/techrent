import { AxiosError } from "axios";

interface NestErrorBody {
  message?: string | string[];
  error?: string;
}

/** Trích thông báo lỗi tiếng Việt từ response NestJS — không bao giờ hiện lỗi kỹ thuật thô (mục 3.2 Roadmap). */
export function getErrorMessage(
  error: unknown,
  fallback = "Đã có lỗi xảy ra, vui lòng thử lại",
): string {
  if (error instanceof AxiosError) {
    if (error.code === "ERR_NETWORK") {
      return "Không thể kết nối tới máy chủ — kiểm tra kết nối mạng rồi thử lại";
    }
    const body = error.response?.data as NestErrorBody | undefined;
    if (body?.message) {
      return Array.isArray(body.message) ? body.message[0] : body.message;
    }
  }
  return fallback;
}
