import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BOOKING_TTL_QUEUE } from './bookings.service';
import { BookingsService } from './bookings.service';

/**
 * Xử lý job TTL tự huỷ booking `pending` sau BOOKING_TTL_MINUTES phút nếu chưa
 * thanh toán (mục 4.1 Roadmap). Job bị huỷ sớm (job.remove()) nếu booking được
 * xác nhận/huỷ trước khi tới hạn — xem BookingsService.scheduleTtlExpiry/cancelTtlExpiry.
 */
@Processor(BOOKING_TTL_QUEUE)
export class BookingTtlProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingTtlProcessor.name);

  constructor(private readonly bookingsService: BookingsService) {
    super();
  }

  async process(job: Job<{ bookingId: string }>): Promise<void> {
    this.logger.log(`Xử lý TTL cho booking ${job.data.bookingId}`);
    await this.bookingsService.expireIfStillPending(job.data.bookingId);
  }
}
