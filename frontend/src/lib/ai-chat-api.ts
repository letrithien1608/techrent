import { useAuthStore } from "@/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiHealth {
  available: boolean;
  model: string;
}

/** Lỗi đã có sẵn câu thông báo thân thiện để hiện thẳng cho người dùng. */
export class AiChatError extends Error {}

export async function fetchAiHealth(): Promise<AiHealth> {
  const response = await fetch(`${API_URL}/ai/health`, { cache: "no-store" });
  if (!response.ok) return { available: false, model: "" };
  return (await response.json()) as AiHealth;
}

const STATUS_MESSAGES: Record<number, string> = {
  429: "Bạn đang hỏi hơi nhanh, vui lòng đợi khoảng 1 phút rồi hỏi tiếp nhé.",
  503: "Trợ lý AI tạm thời không khả dụng, bạn vui lòng liên hệ nhân viên nhé.",
};

/**
 * Gửi câu hỏi và đọc câu trả lời dạng SSE (text/event-stream). Dùng `fetch`
 * thay vì `EventSource` vì EventSource không hỗ trợ POST kèm body; cũng không
 * dùng axios `api` vì axios ở trình duyệt không đọc được stream từng phần.
 * Access token (nếu có) chỉ để backend rate limit theo tài khoản — khách
 * chưa đăng nhập vẫn hỏi được.
 */
export async function streamAiChat(options: {
  message: string;
  history: ChatTurn[];
  signal: AbortSignal;
  onToken: (text: string) => void;
}): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  let response: Response;
  try {
    response = await fetch(`${API_URL}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message: options.message, history: options.history }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal.aborted) throw error;
    throw new AiChatError("Không kết nối được máy chủ, bạn kiểm tra mạng rồi thử lại nhé.");
  }

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const serverMessage = Array.isArray(body?.message) ? body?.message[0] : body?.message;
    throw new AiChatError(
      STATUS_MESSAGES[response.status] ??
        (response.status === 400 && serverMessage
          ? serverMessage
          : "Trợ lý gặp sự cố, bạn thử lại sau nhé."),
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data) as { content?: string; message?: string };
      if (event === "token" && payload.content) options.onToken(payload.content);
      if (event === "error") {
        throw new AiChatError(payload.message ?? STATUS_MESSAGES[503]);
      }
    }
  }
}
