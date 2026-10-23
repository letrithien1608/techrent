import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { AI_CONFIG, type AiConfig } from './ai.config';
import type { ChatRequestDto } from './dto/chat-request.dto';
import {
  type DeviceSuggestion,
  formatChunk,
  formatDevice,
  KnowledgeService,
} from './knowledge.service';
import {
  ChatAbortedError,
  OllamaChatChunk,
  OllamaClient,
  OllamaUnavailableError,
} from './ollama.client';
import { buildMessages } from './prompts';

export const AI_UNAVAILABLE_MESSAGE =
  'Trợ lý AI tạm thời không khả dụng, bạn vui lòng liên hệ nhân viên nhé.';

/** Tham số sinh câu trả lời ngoài num_ctx/temperature (đọc từ env). */
const NUM_PREDICT = 512;
const GENERATION_OPTIONS = {
  top_p: 0.9,
  repeat_penalty: 1.1,
  num_predict: NUM_PREDICT,
};
/** Chừa thêm vài trăm token cho định dạng chat template của model. */
const PROMPT_SAFETY_MARGIN = 200;
const HEALTH_CACHE_MS = 10_000;
/** Hán tự, kana Nhật, Hangul Hàn. */
const CJK_PATTERN = /[぀-ヿ㐀-鿿가-힯＀-￯]/;

export interface ChatStats {
  ttftMs: number | null;
  totalMs: number;
  evalCount: number;
  tokensPerSecond: number | null;
  promptTokens: number | null;
  knowledgeChunks: number;
  devices: number;
  /** true nếu câu trả lời bị cắt vì model chuyển sang ngôn ngữ khác. */
  truncated: boolean;
}

export type ChatStreamEvent =
  | { type: 'token'; content: string }
  | { type: 'done'; stats: ChatStats }
  | { type: 'error'; message: string };

@Injectable()
export class AiService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiService.name);
  private healthCache?: { at: number; available: boolean };

  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    private readonly ollama: OllamaClient,
    private readonly knowledge: KnowledgeService,
  ) {}

  /** Nạp sẵn model vào GPU — KHÔNG await để không chặn quá trình khởi động backend. */
  onApplicationBootstrap(): void {
    if (!this.config.enabled || process.env.NODE_ENV === 'test') return;
    const startedAt = Date.now();
    void this.ollama
      .warmUp()
      .then(() =>
        this.logger.log(
          `Đã làm nóng model ${this.config.model} (${Date.now() - startedAt}ms, keep_alive=${this.config.keepAlive})`,
        ),
      )
      .catch((error: Error) =>
        this.logger.warn(
          `Không làm nóng được model ${this.config.model}: ${error.message} — chat sẽ báo tạm không khả dụng cho tới khi Ollama chạy`,
        ),
      );
  }

  async health(): Promise<{ available: boolean; model: string }> {
    const model = this.config.model;
    if (!this.config.enabled) return { available: false, model };
    if (
      this.healthCache &&
      Date.now() - this.healthCache.at < HEALTH_CACHE_MS
    ) {
      return { available: this.healthCache.available, model };
    }
    let available = false;
    try {
      const models = await this.ollama.listModels();
      available = models.some(
        (name) => name === model || name === `${model}:latest`,
      );
    } catch (error) {
      this.logger.warn(
        `Ollama health check thất bại: ${(error as Error).message}`,
      );
    }
    this.healthCache = { at: Date.now(), available };
    return { available, model };
  }

  /**
   * Mở stream trả lời. Lỗi XẢY RA TRƯỚC khi Ollama bắt đầu trả dữ liệu (tắt,
   * timeout, HTTP lỗi) → throw 503 để controller trả JSON bình thường; lỗi giữa
   * chừng → event `error` trong stream. Client huỷ → `ChatAbortedError`.
   */
  async openChat(
    dto: ChatRequestDto,
    user: RequestUser | undefined,
    signal: AbortSignal,
  ): Promise<AsyncGenerator<ChatStreamEvent>> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(AI_UNAVAILABLE_MESSAGE);
    }
    const startedAt = Date.now();
    const { references, knowledgeChunks, devices } = await this.buildReferences(
      dto.message,
    );
    const messages = buildMessages({
      message: dto.message,
      history: dto.history,
      references,
      isLoggedIn: !!user,
      promptTokenBudget:
        this.config.numCtx - NUM_PREDICT - PROMPT_SAFETY_MARGIN,
    });

    let stream: AsyncGenerator<OllamaChatChunk>;
    try {
      stream = await this.ollama.openChatStream(
        messages,
        {
          num_ctx: this.config.numCtx,
          temperature: this.config.temperature,
          ...GENERATION_OPTIONS,
        },
        signal,
      );
    } catch (error) {
      if (error instanceof ChatAbortedError) throw error;
      this.logger.warn(`Không gọi được Ollama: ${(error as Error).message}`);
      throw new ServiceUnavailableException(AI_UNAVAILABLE_MESSAGE);
    }

    return this.relay(stream, {
      startedAt,
      knowledgeChunks,
      devices,
      who: user ? 'member' : 'guest',
      messageLength: dto.message.length,
      historyLength: dto.history?.length ?? 0,
    });
  }

  /** Thông tin tham khảo đưa vào prompt: kiến thức + (nếu hỏi về thiết bị) danh sách thiết bị thật từ DB. */
  async buildReferences(message: string): Promise<{
    references: string;
    knowledgeChunks: number;
    devices: number;
  }> {
    const { core, chunks } = this.knowledge.retrieve(message);
    // Thứ tự: tóm tắt cốt lõi → thiết bị (nếu có) → các đoạn kiến thức liên quan.
    const parts = [formatChunk(core)];

    let devices: DeviceSuggestion[] | null = null;
    try {
      devices = await this.knowledge.findDevices(message);
      if (devices) {
        if (devices.length > 0) {
          parts.push(
            '### THIẾT BỊ TRONG HỆ THỐNG (giá lấy trực tiếp từ dữ liệu, chỉ dùng đúng các số này)\n' +
              devices.map(formatDevice).join('\n'),
          );
        } else {
          const categories = await this.knowledge.listCategoryNames();
          parts.push(
            '### THIẾT BỊ TRONG HỆ THỐNG\nKhông có thiết bị nào trong hệ thống khớp với tên/nhu cầu trong câu hỏi. ' +
              `Các danh mục TechRent đang cho thuê: ${categories.join(', ')}.`,
          );
        }
      }
    } catch (error) {
      // DB lỗi thì vẫn trả lời được phần chính sách, chỉ thiếu gợi ý thiết bị.
      this.logger.warn(
        `Không tra được thiết bị cho AI: ${(error as Error).message}`,
      );
    }
    return {
      references: parts.join('\n\n'),
      knowledgeChunks: 1 + chunks.length,
      devices: devices?.length ?? 0,
    };
  }

  private async *relay(
    stream: AsyncGenerator<OllamaChatChunk>,
    meta: {
      startedAt: number;
      knowledgeChunks: number;
      devices: number;
      who: string;
      messageLength: number;
      historyLength: number;
    },
  ): AsyncGenerator<ChatStreamEvent> {
    let ttftMs: number | null = null;
    let outputChars = 0;
    try {
      for await (const chunk of stream) {
        let content = chunk.message?.content ?? '';
        // Qwen thỉnh thoảng "trôi" sang tiếng Trung giữa câu — cắt tại ký tự
        // CJK đầu tiên, dừng sinh tiếp (huỷ luôn request Ollama qua return()).
        const cjkIndex = content.search(CJK_PATTERN);
        if (cjkIndex >= 0) content = content.slice(0, cjkIndex);
        if (content) {
          ttftMs ??= Date.now() - meta.startedAt;
          outputChars += content.length;
          yield { type: 'token', content };
        }
        if (cjkIndex >= 0) {
          await stream.return(undefined);
          this.logger.warn(
            `AI chat ${meta.who}: cắt câu trả lời do lẫn ký tự không phải tiếng Việt (outChars=${outputChars})`,
          );
          yield {
            type: 'done',
            stats: {
              ttftMs,
              totalMs: Date.now() - meta.startedAt,
              evalCount: 0,
              tokensPerSecond: null,
              promptTokens: null,
              knowledgeChunks: meta.knowledgeChunks,
              devices: meta.devices,
              truncated: true,
            },
          };
          return;
        }
        if (chunk.done) {
          const evalCount = chunk.eval_count ?? 0;
          const stats: ChatStats = {
            ttftMs,
            totalMs: Date.now() - meta.startedAt,
            evalCount,
            tokensPerSecond: chunk.eval_duration
              ? Number((evalCount / (chunk.eval_duration / 1e9)).toFixed(2))
              : null,
            promptTokens: chunk.prompt_eval_count ?? null,
            knowledgeChunks: meta.knowledgeChunks,
            devices: meta.devices,
            truncated: false,
          };
          // KHÔNG log nội dung tin nhắn — chỉ độ dài và số liệu hiệu năng.
          this.logger.log(
            `AI chat ${meta.who}: msgLen=${meta.messageLength} history=${meta.historyLength} ` +
              `chunks=${meta.knowledgeChunks} devices=${meta.devices} ttft=${ttftMs}ms ` +
              `total=${stats.totalMs}ms promptTokens=${stats.promptTokens} ` +
              `evalTokens=${evalCount} tok/s=${stats.tokensPerSecond} outChars=${outputChars}`,
          );
          yield { type: 'done', stats };
          return;
        }
      }
      throw new OllamaUnavailableError(
        'Stream kết thúc khi chưa có chunk done',
      );
    } catch (error) {
      if (error instanceof ChatAbortedError) {
        this.logger.log(
          `AI chat ${meta.who}: client huỷ sau ${Date.now() - meta.startedAt}ms (outChars=${outputChars})`,
        );
        return;
      }
      this.logger.warn(`AI chat lỗi giữa chừng: ${(error as Error).message}`);
      yield { type: 'error', message: AI_UNAVAILABLE_MESSAGE };
    }
  }
}
