import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { UploadModule } from '../upload/upload.module';
import { UsersModule } from '../users/users.module';
import { BookingTtlProcessor } from './bookings.processor';
import { BookingsController } from './bookings.controller';
import { BookingsService, BOOKING_TTL_QUEUE } from './bookings.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: BOOKING_TTL_QUEUE }),
    PaymentsModule,
    UsersModule,
    NotificationsModule,
    DevicesModule,
    UploadModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingTtlProcessor],
  exports: [BookingsService],
})
export class BookingsModule {}
