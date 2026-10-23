import type { AiConfig } from './ai.config';
import {
  ChatAbortedError,
  OllamaClient,
  OllamaUnavailableError,
} from './ollama.client';

const config: AiConfig = {
  enabled: true,
  baseUrl: 'http://ollama.test',
  model: 'qwen2.5:7b-instruct',
  requestTimeoutMs: 50,
  numCtx: 4096,
  temperature: 0.3,
  keepAlive: '30m',
};

function ndjsonResponse(lines: object[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines)
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

/** Response treo vô hạn — chỉ kết thúc khi signal bị abort (giống fetch thật). */
function hangingFetch(): jest.Mock {
  return jest.fn(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      }),
  );
}

describe('OllamaClient', () => {
  const originalFetch = global.fetch;
  let client: OllamaClient;

  beforeEach(() => {
    client = new OllamaClient(config);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('đọc stream NDJSON thành từng chunk', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      ndjsonResponse([
        { message: { role: 'assistant', content: 'Xin ' }, done: false },
        { message: { role: 'assistant', content: 'chào' }, done: false },
        { done: true, eval_count: 2, eval_duration: 1e9 },
      ]),
    );
    const stream = await client.openChatStream(
      [],
      {},
      new AbortController().signal,
    );
    const contents: string[] = [];
    for await (const chunk of stream)
      contents.push(chunk.message?.content ?? '[done]');
    expect(contents).toEqual(['Xin ', 'chào', '[done]']);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://ollama.test/api/chat');
    expect(JSON.parse(init.body)).toMatchObject({
      stream: true,
      keep_alive: '30m',
      model: config.model,
    });
  });

  it('Ollama tắt (ECONNREFUSED) → OllamaUnavailableError', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(
      client.openChatStream([], {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it('Ollama trả HTTP lỗi (VD model chưa pull) → OllamaUnavailableError', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('model not found', { status: 404 }));
    await expect(
      client.openChatStream([], {}, new AbortController().signal),
    ).rejects.toThrow(/HTTP 404/);
  });

  it('không phản hồi trong requestTimeoutMs → OllamaUnavailableError (timeout)', async () => {
    global.fetch = hangingFetch();
    await expect(
      client.openChatStream([], {}, new AbortController().signal),
    ).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it('client huỷ → abort luôn request tới Ollama và ném ChatAbortedError', async () => {
    const fetchMock = hangingFetch();
    global.fetch = fetchMock;
    const controller = new AbortController();
    const pending = client.openChatStream([], {}, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ChatAbortedError);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal!;
    expect(signal.aborted).toBe(true);
  });

  it('Ollama báo lỗi trong stream → OllamaUnavailableError', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        ndjsonResponse([{ error: 'out of memory', done: true }]),
      );
    const stream = await client.openChatStream(
      [],
      {},
      new AbortController().signal,
    );
    await expect(stream.next()).rejects.toThrow('out of memory');
  });

  it('listModels trả tên các model đã pull', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ models: [{ name: 'qwen2.5:7b-instruct' }] }),
          { status: 200 },
        ),
      );
    await expect(client.listModels()).resolves.toEqual(['qwen2.5:7b-instruct']);
  });
});
