import { ConfigService } from '@nestjs/config';

export const AI_CONFIG = Symbol('AI_CONFIG');

export interface AiConfig {
  enabled: boolean;
  baseUrl: string;
  model: string;
  /** Không nhận được dữ liệu nào từ Ollama trong khoảng này thì huỷ request (idle timeout). */
  requestTimeoutMs: number;
  numCtx: number;
  temperature: number;
  keepAlive: string;
}

const DEFAULTS = {
  OLLAMA_BASE_URL: 'http://localhost:11434',
  OLLAMA_MODEL: 'qwen2.5:7b-instruct',
  AI_ENABLED: 'true',
  AI_REQUEST_TIMEOUT_MS: '60000',
  AI_NUM_CTX: '4096',
  AI_TEMPERATURE: '0.3',
  AI_KEEP_ALIVE: '30m',
} as const;

type AiEnvKey = keyof typeof DEFAULTS;

/**
 * Đọc + validate cấu hình AI lúc khởi động. Thiếu biến thì dùng mặc định, có
 * mà SAI định dạng thì throw ngay (fail fast lúc deploy) — khác lỗi Ollama tắt
 * lúc chạy, vốn chỉ làm tính năng chat tạm không khả dụng.
 */
export function parseAiConfig(
  get: (key: string) => string | undefined,
): AiConfig {
  const read = (key: AiEnvKey) => (get(key) ?? DEFAULTS[key]).trim();

  const enabledRaw = read('AI_ENABLED').toLowerCase();
  if (enabledRaw !== 'true' && enabledRaw !== 'false') {
    throw new Error('AI_ENABLED phải là "true" hoặc "false"');
  }

  const baseUrl = read('OLLAMA_BASE_URL').replace(/\/+$/, '');
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      throw new Error();
  } catch {
    throw new Error(`OLLAMA_BASE_URL không hợp lệ: "${baseUrl}"`);
  }

  const model = read('OLLAMA_MODEL');
  if (!model) throw new Error('OLLAMA_MODEL không được để trống');

  const positiveInt = (key: AiEnvKey) => {
    const value = Number(read(key));
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${key} phải là số nguyên dương`);
    }
    return value;
  };

  const temperature = Number(read('AI_TEMPERATURE'));
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error('AI_TEMPERATURE phải nằm trong khoảng 0-2');
  }

  const keepAlive = read('AI_KEEP_ALIVE');
  if (!/^(-1|\d+(ms|s|m|h)?)$/.test(keepAlive)) {
    throw new Error('AI_KEEP_ALIVE không hợp lệ (VD: 30m, 1h, -1)');
  }

  return {
    enabled: enabledRaw === 'true',
    baseUrl,
    model,
    requestTimeoutMs: positiveInt('AI_REQUEST_TIMEOUT_MS'),
    numCtx: positiveInt('AI_NUM_CTX'),
    temperature,
    keepAlive,
  };
}

export const aiConfigProvider = {
  provide: AI_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AiConfig =>
    parseAiConfig((key) => config.get<string>(key)),
};
