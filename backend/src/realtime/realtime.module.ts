import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

// Global giống PrismaModule/RedisModule (mục 3 CLAUDE.md) — RealtimeGateway
// là hạ tầng dùng chung cho nhiều module nghiệp vụ không liên quan tới nhau
// (Bookings, Maintenance, Devices), tương tự Prisma/Redis. Module này KHÔNG
// import module nghiệp vụ nào (module "lá"), nên không có rủi ro import cycle
// dù được nhiều module khác cùng phụ thuộc vào.
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
