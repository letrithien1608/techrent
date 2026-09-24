import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';

// Global giống PrismaModule/RedisModule (mục 3 CLAUDE.md) — RealtimeGateway
// là hạ tầng dùng chung cho nhiều module nghiệp vụ không liên quan tới nhau
// (Bookings, Maintenance, Devices, Notifications), tương tự Prisma/Redis.
// Module này KHÔNG import module nghiệp vụ nào (module "lá"), nên không có
// rủi ro import cycle dù được nhiều module khác cùng phụ thuộc vào.
// `JwtModule.register({})` (giống cách AuthModule đăng ký — secret truyền
// riêng từng lệnh gọi `verifyAsync`, không cấu hình cố định ở module) chỉ để
// gateway tự xác thực token lúc client kết nối WebSocket (join đúng room
// `user:${userId}` nhận thông báo cá nhân) — KHÔNG import AuthModule (module
// đó có nhiều phụ thuộc khác, import vào đây không cần thiết và có thể tạo
// rủi ro cycle nếu AuthModule sau này lại cần RealtimeGateway).
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
