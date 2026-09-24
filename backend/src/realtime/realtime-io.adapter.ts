import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * CORS riêng cho WebSocket (khác CORS REST API đã cấu hình trong `main.ts`
 * qua `app.enableCors()`), đọc cùng biến `CORS_ORIGIN` cho nhất quán. Đặt ở
 * đây (áp dụng trong `bootstrap()`, SAU khi `NestFactory.create()` đã chạy
 * xong) thay vì trong decorator `@WebSocketGateway({ cors: ... })` của
 * `RealtimeGateway` — decorator evaluate ngay lúc import module (trước khi
 * `ConfigModule.forRoot()` kịp nạp `.env` vào `process.env`), còn ở đây thì
 * `process.env.CORS_ORIGIN` chắc chắn đã có giá trị (đúng thời điểm an toàn
 * y hệt chỗ REST API đọc biến này).
 */
export class RealtimeIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
    const corsOptions: ServerOptions = {
      ...options,
      cors: {
        origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
        credentials: true,
      },
    };
    return super.createIOServer(port, corsOptions);
  }
}
