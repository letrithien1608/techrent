import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import type { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { AiThrottlerExceptionFilter } from './ai-throttler.filter';
import { AiService, type ChatStreamEvent } from './ai.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatAbortedError } from './ollama.client';

@ApiTags('ai')
@Controller('ai')
@UseFilters(AiThrottlerExceptionFilter)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Public()
  @Get('health')
  @ApiOperation({
    summary:
      'Ollama còn sống và đã có model chưa — frontend dùng để ẩn/hiện trạng thái trợ lý',
  })
  health() {
    return this.aiService.health();
  }

  /**
   * Trả lời dạng SSE (text/event-stream): các event `token` → `done` (kèm thống
   * kê) hoặc `error`. Khách chưa đăng nhập vẫn dùng được (@OptionalAuth), rate
   * limit 10 câu/phút theo user (nếu có token) hoặc theo IP.
   */
  @OptionalAuth()
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @Post('chat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hỏi Trợ lý AI TechRent (stream SSE)' })
  async chat(
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: RequestUser | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const abort = new AbortController();
    // `close` trên response (không phải request) mới phản ánh đúng việc client ngắt kết nối.
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    let stream: AsyncGenerator<ChatStreamEvent>;
    try {
      stream = await this.aiService.openChat(dto, user, abort.signal);
    } catch (error) {
      if (error instanceof ChatAbortedError) return;
      throw error;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for await (const event of stream) {
      if (abort.signal.aborted) break;
      const { type, ...payload } = event;
      res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
    if (!res.writableEnded) res.end();
  }
}
