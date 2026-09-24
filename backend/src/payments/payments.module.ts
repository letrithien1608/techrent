import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BOOKING_TTL_QUEUE } from '../bookings/bookings.constants';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: BOOKING_TTL_QUEUE }),
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
