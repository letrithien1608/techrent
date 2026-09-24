import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Module "lá" (không import module nghiệp vụ nào) — Bookings/Payments/
// Maintenance import NGƯỢC LẠI module này để gọi NotificationsService, đúng
// chiều đã rút ra từ bài học import cycle Tuần 7 (mục 2 CLAUDE.md).
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
