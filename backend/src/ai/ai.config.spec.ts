import { parseAiConfig } from './ai.config';

const fromEnv = (env: Record<string, string>) =>
  parseAiConfig((key) => env[key]);

describe('parseAiConfig', () => {
  it('thiếu biến thì dùng mặc định', () => {
    expect(fromEnv({})).toEqual({
      enabled: true,
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5:7b-instruct',
      requestTimeoutMs: 60000,
      numCtx: 4096,
      temperature: 0.3,
      keepAlive: '30m',
    });
  });

  it('đọc đúng giá trị từ env, bỏ "/" cuối URL', () => {
    const config = fromEnv({
      AI_ENABLED: 'false',
      OLLAMA_BASE_URL: 'http://gpu-box:11434/',
      AI_NUM_CTX: '8192',
      AI_TEMPERATURE: '0',
    });
    expect(config.enabled).toBe(false);
    expect(config.baseUrl).toBe('http://gpu-box:11434');
    expect(config.numCtx).toBe(8192);
    expect(config.temperature).toBe(0);
  });

  it.each([
    [{ AI_ENABLED: 'yes' }, 'AI_ENABLED'],
    [{ OLLAMA_BASE_URL: 'localhost' }, 'OLLAMA_BASE_URL'],
    [{ AI_REQUEST_TIMEOUT_MS: '-5' }, 'AI_REQUEST_TIMEOUT_MS'],
    [{ AI_NUM_CTX: 'abc' }, 'AI_NUM_CTX'],
    [{ AI_TEMPERATURE: '3' }, 'AI_TEMPERATURE'],
    [{ AI_KEEP_ALIVE: 'mãi mãi' }, 'AI_KEEP_ALIVE'],
  ])('giá trị sai định dạng → báo lỗi ngay khi khởi động (%o)', (env, key) => {
    expect(() => fromEnv(env)).toThrow(key);
  });
});
