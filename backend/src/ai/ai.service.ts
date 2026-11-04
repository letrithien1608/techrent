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
import {
  findUnsafeOutput,
  type Guardrail,
  INJECTION_REPLY,
  isPromptInjection,
  OUTPUT_HOLDBACK_CHARS,
} from './guardrails';
import { buildMessages } from './prompts';
import {
  calculateLateFeeTable,
  checkLateFeeAnswer,
  extractLateFeeQuery,
  formatLateFeeReference,
  type LateFeeCalculation,
  lateFeeTemplateReply,
} from './late-fee-calc';

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
export interface ChatStats {
  ttftMs: number | null;
  totalMs: number;
  evalCount: number;
  tokensPerSecond: number | null;
  promptTokens: number | null;
  knowledgeChunks: number;
  devices: number;
  /** Lớp chặn phía server đã can thiệp (null = câu trả lời đi thẳng từ model). */
  guardrail: Guardrail | 'late-fee-corrected' | null;
  /** Câu hỏi tính phí trễ hạn đã được hệ thống tự tính (có bảng tính sẵn). */
  lateFeeTotal?: number | null;
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
    const who = user ? 'member' : 'guest';
    if (isPromptInjection(dto.message)) {
      this.logger.warn(
        `AI chat ${who}: chặn yêu cầu đổi vai trò/xem prompt (msgLen=${dto.message.length})`,
      );
      return this.cannedReply(INJECTION_REPLY, startedAt);
    }
    const { references, knowledgeChunks, devices, lateFee } =
      await this.buildReferences(dto.message);
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
      who,
      messageLength: dto.message.length,
      historyLength: dto.history?.length ?? 0,
      lateFee,
    });
  }

  /** Thông tin tham khảo đưa vào prompt: kiến thức + (nếu hỏi về thiết bị) danh sách thiết bị thật từ DB. */
  async buildReferences(message: string): Promise<{
    references: string;
    knowledgeChunks: number;
    devices: number;
    lateFee: LateFeeCalculation | null;
  }> {
    const { core, chunks } = this.knowledge.retrieve(message);
    // Thứ tự: tóm tắt cốt lõi → bảng phí trễ tính sẵn (nếu có) → thiết bị → các đoạn kiến thức.
    const parts = [formatChunk(core)];
    const lateFee = await this.calculateLateFee(message);
    if (lateFee) parts.push(formatLateFeeReference(lateFee));

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
      references: [...parts, ...chunks.map(formatChunk)].join('\n\n'),
      knowledgeChunks: 1 + chunks.length,
      devices: devices?.length ?? 0,
      lateFee,
    };
  }

  /**
   * Câu hỏi tính phí trễ hạn: hệ thống tự tính bằng `calculateLateFeeForDays()`.
   * Giá thuê lấy từ câu hỏi, không có thì lấy từ thiết bị được nhắc tên rõ ràng
   * (kèm mức trần = giá trị thiết bị). Thiếu số liệu → null, model trả lời như cũ.
   */
  async calculateLateFee(message: string): Promise<LateFeeCalculation | null> {
    const query = extractLateFeeQuery(message);
    if (!query) return null;
    let device: DeviceSuggestion | null = null;
    try {
      device = await this.knowledge.findDeviceByName(message);
    } catch (error) {
      this.logger.warn(
        `Không tra được thiết bị để tính phí trễ: ${(error as Error).message}`,
      );
    }
    // Khách tự nêu giá khác giá của máy → dùng giá khách nêu, không gắn tên máy.
    if (
      device &&
      query.pricePerDay !== null &&
      query.pricePerDay !== device.pricePerDay
    ) {
      device = null;
    }
    const pricePerDay = query.pricePerDay ?? device?.pricePerDay ?? null;
    if (pricePerDay === null) return null;
    return calculateLateFeeTable({
      days: query.days,
      pricePerDay,
      originalPrice: device?.originalPrice ?? query.originalPrice,
      deviceName: device?.name ?? null,
      verifyAnswer: !query.mixed,
    });
  }

  private async *cannedReply(
    text: string,
    startedAt: number,
  ): AsyncGenerator<ChatStreamEvent> {
    yield { type: 'token', content: text };
    yield {
      type: 'done',
      stats: {
        ttftMs: Date.now() - startedAt,
        totalMs: Date.now() - startedAt,
        evalCount: 0,
        tokensPerSecond: null,
        promptTokens: null,
        knowledgeChunks: 0,
        devices: 0,
        guardrail: 'prompt-injection',
      },
    };
  }

  /**
   * Chuyển chunk Ollama thành event cho client. Giữ lại vài ký tự cuối
   * (OUTPUT_HOLDBACK_CHARS) trước khi gửi để kịp phát hiện dấu hiệu lộ prompt
   * nằm vắt qua 2 chunk; gặp nội dung không an toàn thì cắt tại đó và huỷ
   * luôn request Ollama (qua `stream.return()`).
   */
  private async *relay(
    stream: AsyncGenerator<OllamaChatChunk>,
    meta: {
      startedAt: number;
      knowledgeChunks: number;
      devices: number;
      who: string;
      messageLength: number;
      historyLength: number;
      /** Có bảng tính sẵn → giữ lại cả câu trả lời để kiểm tra tổng trước khi gửi. */
      lateFee: LateFeeCalculation | null;
    },
  ): AsyncGenerator<ChatStreamEvent> {
    let ttftMs: number | null = null;
    let text = '';
    let sent = 0;
    const flush = (until: number): ChatStreamEvent | null => {
      if (until <= sent) return null;
      const content = text.slice(sent, until);
      sent = until;
      ttftMs ??= Date.now() - meta.startedAt;
      return { type: 'token', content };
    };
    const baseStats = () => ({
      ttftMs,
      totalMs: Date.now() - meta.startedAt,
      knowledgeChunks: meta.knowledgeChunks,
      devices: meta.devices,
      lateFeeTotal: meta.lateFee?.total ?? null,
    });

    try {
      for await (const chunk of stream) {
        text += chunk.message?.content ?? '';
        const unsafe = findUnsafeOutput(text);
        if (unsafe) {
          const head = flush(unsafe.index);
          if (head) yield head;
          await stream.return(undefined);
          if (unsafe.reason === 'internal-leak') {
            const separator = sent > 0 ? '\n\n' : '';
            yield { type: 'token', content: separator + INJECTION_REPLY };
          }
          this.logger.warn(
            `AI chat ${meta.who}: cắt câu trả lời (${unsafe.reason}) sau ${sent} ký tự`,
          );
          yield {
            type: 'done',
            stats: {
              ...baseStats(),
              evalCount: 0,
              tokensPerSecond: null,
              promptTokens: null,
              guardrail: unsafe.reason,
            },
          };
          return;
        }
        if (chunk.done && meta.lateFee?.verifyAnswer) {
          const problem = checkLateFeeAnswer(text, meta.lateFee);
          if (problem) {
            // Đã giữ lại toàn bộ (chưa gửi gì) → thay hẳn bằng câu dựng từ bảng.
            this.logger.warn(
              `AI chat ${meta.who}: thay câu trả lời phí trễ hạn (${problem}, tổng đúng ${meta.lateFee.total})`,
            );
            text = lateFeeTemplateReply(meta.lateFee);
            const event = flush(text.length);
            if (event) yield event;
            yield {
              type: 'done',
              stats: {
                ...baseStats(),
                evalCount: chunk.eval_count ?? 0,
                tokensPerSecond: null,
                promptTokens: chunk.prompt_eval_count ?? null,
                guardrail: 'late-fee-corrected',
              },
            };
            return;
          }
        }
        // Câu tính phí trễ: chưa gửi gì cho tới khi kiểm tra xong ở chunk cuối.
        const event = meta.lateFee?.verifyAnswer
          ? chunk.done
            ? flush(text.length)
            : null
          : flush(
              chunk.done ? text.length : text.length - OUTPUT_HOLDBACK_CHARS,
            );
        if (event) yield event;

        if (chunk.done) {
          const evalCount = chunk.eval_count ?? 0;
          const stats: ChatStats = {
            ...baseStats(),
            evalCount,
            tokensPerSecond: chunk.eval_duration
              ? Number((evalCount / (chunk.eval_duration / 1e9)).toFixed(2))
              : null,
            promptTokens: chunk.prompt_eval_count ?? null,
            guardrail: null,
          };
          // KHÔNG log nội dung tin nhắn — chỉ độ dài và số liệu hiệu năng.
          this.logger.log(
            `AI chat ${meta.who}: msgLen=${meta.messageLength} history=${meta.historyLength} ` +
              `chunks=${meta.knowledgeChunks} devices=${meta.devices} ttft=${ttftMs}ms ` +
              `total=${stats.totalMs}ms promptTokens=${stats.promptTokens} ` +
              `evalTokens=${evalCount} tok/s=${stats.tokensPerSecond} outChars=${text.length}` +
              (meta.lateFee
                ? ` lateFee=${meta.lateFee.verifyAnswer ? 'checked' : 'reference-only'}`
                : ''),
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
          `AI chat ${meta.who}: client huỷ sau ${Date.now() - meta.startedAt}ms (outChars=${sent})`,
        );
        return;
      }
      this.logger.warn(`AI chat lỗi giữa chừng: ${(error as Error).message}`);
      yield { type: 'error', message: AI_UNAVAILABLE_MESSAGE };
    }
  }
}
