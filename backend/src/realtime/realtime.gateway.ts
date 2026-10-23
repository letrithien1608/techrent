import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DeviceStatus } from '../generated/prisma/client';

export interface DeviceStatusChangedPayload {
  deviceId: string;
  status: DeviceStatus;
}

export interface NotificationCreatedPayload {
  id: string;
  type: string;
  title: string | null;
  message: string;
  link: string | null;
  metadata: unknown;
  isRead: boolean;
  createdAt: Date;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
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
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Kết nối lúc đầu CÓ THỂ kèm sẵn `auth.token` (frontend đọc access token từ
   * Zustand store ngay lúc tạo socket — xem `frontend/src/lib/realtime-socket.ts`)
   * nếu người dùng đã đăng nhập từ trước. Không có/token hỏng thì vẫn giữ kết
   * nối ở trạng thái ẩn danh — chỉ mất khả năng nhận thông báo cá nhân, vẫn
   * nhận `device:status-changed` broadcast toàn cục bình thường.
   */
  async handleConnection(client: Socket): Promise<void> {
    this.logger.log(`Client realtime kết nối: ${client.id}`);
    const token = client.handshake.auth?.token as string | undefined;
    await this.joinUserRoom(client, token);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client realtime ngắt kết nối: ${client.id}`);
  }

  /**
   * Client gọi lại sự kiện này SAU KHI đăng nhập/refresh token thành công mà
   * KHÔNG làm mới kết nối socket (option `auth` của socket.io-client chỉ tự
   * gửi lại lúc (re)connect, không tự cập nhật giữa chừng một kết nối đang
   * mở) — xem `useAuthStore.subscribe(...)` ở `realtime-socket.ts`.
   */
  @SubscribeMessage('notifications:authenticate')
  async handleAuthenticate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { token?: string },
  ): Promise<void> {
    await this.joinUserRoom(client, payload?.token);
  }

  /** Client gọi khi đăng xuất — rời room cá nhân, tránh 1 trình duyệt dùng chung tài khoản khác vẫn nhận nhầm thông báo của người trước. */
  @SubscribeMessage('notifications:logout')
  handleLogout(@ConnectedSocket() client: Socket): void {
    this.leaveUserRoom(client);
  }

  /**
   * Gọi SAU KHI hành động nghiệp vụ đã ghi DB thành công (BookingsService,
   * MaintenanceService, DevicesService) — gateway không tự quyết định khi
   * nào trạng thái thiết bị đổi, chỉ phát tin đã đổi.
   */
  emitDeviceStatusChanged(payload: DeviceStatusChangedPayload): void {
    this.server.emit('device:status-changed', payload);
  }

  /**
   * Chỉ gửi cho ĐÚNG user sở hữu thông báo (room `user:${userId}`) — KHÁC
   * hẳn `emitDeviceStatusChanged` (broadcast toàn cục). Gọi bởi
   * `NotificationsService.create()` sau khi ghi DB thành công.
   */
  emitNotificationCreated(
    userId: string,
    payload: NotificationCreatedPayload,
  ): void {
    this.server.to(userRoom(userId)).emit('notification:created', payload);
  }

  private async joinUserRoom(client: Socket, token?: string): Promise<void> {
    this.leaveUserRoom(client);
    if (!token) return;
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        token,
        { secret: this.configService.get<string>('JWT_ACCESS_SECRET') },
      );
      client.data.userId = payload.sub;
      await client.join(userRoom(payload.sub));
    } catch {
      // Token thiếu/hết hạn/sai chữ ký — bỏ qua, KHÔNG throw làm rớt kết nối,
      // client vẫn dùng được các tính năng realtime không cần đăng nhập.
    }
  }

  private leaveUserRoom(client: Socket): void {
    const currentUserId = client.data?.userId as string | undefined;
    if (currentUserId) {
      client.leave(userRoom(currentUserId));
      client.data.userId = undefined;
    }
  }
}
