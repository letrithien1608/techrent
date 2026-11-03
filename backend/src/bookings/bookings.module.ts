import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { UploadModule } from '../upload/upload.module';
import { UsersModule } from '../users/users.module';
import { BookingTtlProcessor } from './bookings.processor';
import { BookingsController } from './bookings.controller';
import { BookingIssuesController } from './booking-issues.controller';
import { BookingIssuesService } from './booking-issues.service';
import { BookingLossController } from './booking-loss.controller';
import { BookingLossService } from './booking-loss.service';
import { BookingOverdueProcessor } from './booking-overdue.processor';
import { BOOKING_OVERDUE_QUEUE } from './bookings.constants';
import { BookingsService, BOOKING_TTL_QUEUE } from './bookings.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: BOOKING_TTL_QUEUE }),
    BullModule.registerQueue({ name: BOOKING_OVERDUE_QUEUE }),
    PaymentsModule,
    UsersModule,
    NotificationsModule,
    DevicesModule,
    UploadModule,
  ],
  controllers: [
    BookingsController,
    BookingIssuesController,
    BookingLossController,
  ],
  providers: [
    BookingsService,
    BookingIssuesService,
    BookingLossService,
    BookingTtlProcessor,
    BookingOverdueProcessor,
  ],
  exports: [BookingsService],
})
export class BookingsModule {}
