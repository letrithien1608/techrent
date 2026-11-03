import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BOOKING_OVERDUE_QUEUE } from './bookings.constants';
import { BookingLossService } from './booking-loss.service';

/** Job lặp mỗi giờ: đánh dấu đơn quá hạn lâu là nghi mất thiết bị. */
@Processor(BOOKING_OVERDUE_QUEUE)
export class BookingOverdueProcessor extends WorkerHost {
  constructor(private readonly lossService: BookingLossService) {
    super();
  }

  async process(): Promise<void> {
    await this.lossService.flagSuspectedLost();
  }
}
