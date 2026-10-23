import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

/** Đổi lỗi 429 mặc định ("ThrottlerException: Too Many Requests") sang tiếng Việt cho riêng /ai/*. */
@Catch(ThrottlerException)
export class AiThrottlerExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(429).json({
      statusCode: 429,
      message:
        'Bạn đang hỏi hơi nhanh, vui lòng đợi khoảng 1 phút rồi hỏi tiếp nhé.',
    });
  }
}
