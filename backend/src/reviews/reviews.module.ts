import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  DeviceReviewsController,
  ReviewsController,
} from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [DevicesModule, NotificationsModule],
  controllers: [ReviewsController, DeviceReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
