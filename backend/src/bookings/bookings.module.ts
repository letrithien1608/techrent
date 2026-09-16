import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BookingTtlProcessor } from './bookings.processor';
import { BookingsController } from './bookings.controller';
import { BookingsService, BOOKING_TTL_QUEUE } from './bookings.service';

@Module({
  imports: [BullModule.registerQueue({ name: BOOKING_TTL_QUEUE })],
  controllers: [BookingsController],
  providers: [BookingsService, BookingTtlProcessor],
  exports: [BookingsService],
})
export class BookingsModule {}
