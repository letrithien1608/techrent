import { ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { Response } from 'express';
import { AiController } from './ai.controller';
import type { AiService, ChatStreamEvent } from './ai.service';
import { ChatAbortedError } from './ollama.client';

class FakeResponse extends EventEmitter {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = '';
  writableEnded = false;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  setHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
  }
  flushHeaders() {}
  write(chunk: string) {
    this.body += chunk;
    return true;
  }
  end() {
    this.writableEnded = true;
  }
}

describe('AiController', () => {
  let aiService: { openChat: jest.Mock; health: jest.Mock };
  let controller: AiController;

  beforeEach(() => {
    aiService = { openChat: jest.fn(), health: jest.fn() };
    controller = new AiController(aiService as unknown as AiService);
  });

  it('ghi đúng định dạng SSE: token… rồi done', async () => {
    aiService.openChat.mockResolvedValue(
      (async function* (): AsyncGenerator<ChatStreamEvent> {
        yield { type: 'token', content: 'Xin chào' };
        yield { type: 'done', stats: { totalMs: 10 } as never };
      })(),
    );
    const res = new FakeResponse();
    await controller.chat(
      { message: 'hi' },
      undefined,
      res as unknown as Response,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toBe(
      'event: token\ndata: {"content":"Xin chào"}\n\n' +
        'event: done\ndata: {"stats":{"totalMs":10}}\n\n',
    );
    expect(res.writableEnded).toBe(true);
  });

  it('Ollama không khả dụng → ném 503 để exception filter trả JSON', async () => {
    aiService.openChat.mockRejectedValue(new ServiceUnavailableException('x'));
    await expect(
      controller.chat(
        { message: 'hi' },
        undefined,
        new FakeResponse() as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('client ngắt kết nối → abort signal truyền xuống service', async () => {
    let captured: AbortSignal | undefined;
    const res = new FakeResponse();
    aiService.openChat.mockImplementation(
      (_dto, _user, signal: AbortSignal) => {
        captured = signal;
        res.emit('close');
        return Promise.reject(new ChatAbortedError());
      },
    );
    await controller.chat(
      { message: 'hi' },
      undefined,
      res as unknown as Response,
    );
    expect(captured?.aborted).toBe(true);
    expect(res.body).toBe('');
  });

  it('truyền user (nếu có) cho service để biết khách đã đăng nhập', async () => {
    aiService.openChat.mockResolvedValue((async function* () {})());
    const user = { userId: 'u1', email: 'a@b.c', role: 'customer' as const };
    await controller.chat(
      { message: 'hi' },
      user,
      new FakeResponse() as unknown as Response,
    );
    expect(aiService.openChat.mock.calls[0][1]).toBe(user);
  });
});
