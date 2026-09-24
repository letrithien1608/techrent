import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DeviceStatus } from '../generated/prisma/client';

export interface DeviceStatusChangedPayload {
  deviceId: string;
  status: DeviceStatus;
}

/**
 * Broadcast toàn cục (KHÔNG dùng room theo deviceId): cả trang danh sách
 * (/devices, cần biết TẤT CẢ thiết bị đổi trạng thái) lẫn trang chi tiết
 * (/devices/[id], chỉ cần đúng 1 thiết bị) đều lắng nghe CHUNG 1 event rồi
 * tự lọc theo deviceId ở phía client. Với quy mô hiện tại (25 thiết bị demo),
 * broadcast toàn cục đơn giản hơn hẳn cơ chế join/leave room mà vẫn đáp ứng
 * đúng cả 2 use-case — join room theo từng thiết bị chỉ đáng làm khi số
 * lượng client/thiết bị đủ lớn để bandwidth broadcast trở thành vấn đề thật,
 * hiện tại chưa tới ngưỡng đó (không tối ưu sớm cho quy mô chưa tồn tại).
 *
 * CORS cho socket.io được cấu hình ở `RealtimeIoAdapter` (đọc CORS_ORIGIN
 * tại đúng thời điểm an toàn trong main.ts), KHÔNG khai báo trong decorator
 * `@WebSocketGateway()` — decorator evaluate ngay lúc import module, TRƯỚC
 * khi `ConfigModule.forRoot()` (gọi trong @Module() của AppModule) kịp nạp
 * `.env` vào process.env, nên đọc process.env.CORS_ORIGIN ở đây sẽ không
 * đáng tin cậy.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket): void {
    this.logger.log(`Client realtime kết nối: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client realtime ngắt kết nối: ${client.id}`);
  }

  /**
   * Gọi SAU KHI hành động nghiệp vụ đã ghi DB thành công (BookingsService,
   * MaintenanceService, DevicesService) — gateway không tự quyết định khi
   * nào trạng thái thiết bị đổi, chỉ phát tin đã đổi.
   */
  emitDeviceStatusChanged(payload: DeviceStatusChangedPayload): void {
    this.server.emit('device:status-changed', payload);
  }
}
