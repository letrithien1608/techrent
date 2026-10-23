import { Inject, Injectable } from '@nestjs/common';
import { AI_CONFIG, type AiConfig } from './ai.config';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 1 dòng NDJSON Ollama trả về khi `stream: true`. */
export interface OllamaChatChunk {
  message?: { role: string; content: string };
  done: boolean;
  /** Các trường thống kê chỉ có ở chunk cuối (done = true). Thời lượng tính bằng nano giây. */
  eval_count?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  load_duration?: number;
  total_duration?: number;
  error?: string;
}

/** Ollama tắt, không phản hồi, timeout hoặc trả lỗi — tầng trên đổi thành 503. */
export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

/** Client (trình duyệt) tự huỷ — đóng tab, bấm "Dừng". Không phải lỗi hệ thống. */
export class ChatAbortedError extends Error {
  constructor() {
    super('Client đã huỷ yêu cầu');
    this.name = 'ChatAbortedError';
  }
}

const HEALTH_TIMEOUT_MS = 5_000;

/**
 * Client HTTP tối giản cho Ollama (dùng `fetch` có sẵn của Node, không thêm
 * SDK). Mọi lệnh gọi đều có timeout tường minh — đúng quy tắc mục 2 CLAUDE.md
 * ("mọi lệnh gọi mạng ra ngoài PHẢI có timeout") sau bài học SMTP treo.
 */
@Injectable()
export class OllamaClient {
  constructor(@Inject(AI_CONFIG) private readonly config: AiConfig) {}

  async listModels(): Promise<string[]> {
    const response = await this.request('/api/tags', {
      method: 'GET',
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const body = (await response.json()) as { models?: { name: string }[] };
    return (body.models ?? []).map((model) => model.name);
  }

  /** Nạp sẵn model vào GPU/RAM (request rỗng) để câu hỏi đầu tiên không phải chờ load. */
  async warmUp(): Promise<void> {
    const response = await this.request('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: this.config.model,
        keep_alive: this.config.keepAlive,
      }),
      signal: AbortSignal.timeout(this.config.requestTimeoutMs * 3),
    });
    await response.text();
  }

  /**
   * Gọi /api/chat với stream=true, trả về từng chunk. Nếu không có byte nào về
   * trong `requestTimeoutMs` (cả lúc chờ phản hồi đầu lẫn giữa các chunk) thì huỷ.
   * Lỗi xảy ra TRƯỚC khi có response (Ollama tắt/timeout/HTTP lỗi) được throw
   * ngay từ lời gọi đầu tiên của generator để tầng trên trả 503 sạch sẽ.
   */
  async openChatStream(
    messages: OllamaMessage[],
    options: Record<string, number>,
    externalSignal: AbortSignal,
  ): Promise<AsyncGenerator<OllamaChatChunk>> {
    const idle = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => idle.abort(new Error('Ollama timeout')),
        this.config.requestTimeoutMs,
      );
    };
    const signal = AbortSignal.any([externalSignal, idle.signal]);

    resetTimer();
    let response: Response;
    try {
      response = await this.request('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: this.config.model,
          messages,
          stream: true,
          keep_alive: this.config.keepAlive,
          options,
        }),
        signal,
      });
    } catch (error) {
      clearTimeout(timer);
      if (externalSignal.aborted) throw new ChatAbortedError();
      throw error;
    }
    if (!response.body) {
      clearTimeout(timer);
      throw new OllamaUnavailableError('Ollama không trả về dữ liệu stream');
    }

    const reader = response.body.getReader();
    return (async function* () {
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          resetTimer();
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const chunk = JSON.parse(line) as OllamaChatChunk;
            if (chunk.error) throw new OllamaUnavailableError(chunk.error);
            yield chunk;
          }
        }
      } catch (error) {
        if (externalSignal.aborted) throw new ChatAbortedError();
        throw error instanceof OllamaUnavailableError
          ? error
          : new OllamaUnavailableError((error as Error).message);
      } finally {
        clearTimeout(timer);
        // Huỷ cả kết nối HTTP tới Ollama nếu bên dùng dừng đọc giữa chừng.
        await reader.cancel().catch(() => undefined);
      }
    })();
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      throw new OllamaUnavailableError(
        `Không kết nối được Ollama: ${(error as Error).message}`,
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new OllamaUnavailableError(
        `Ollama trả về HTTP ${response.status}: ${detail.slice(0, 200)}`,
      );
    }
    return response;
  }
}
