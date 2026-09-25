import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { DevicesCacheService } from './devices-cache.service';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [UploadModule],
  controllers: [DevicesController],
  providers: [DevicesService, DevicesCacheService],
  // Export DevicesCacheService để BookingsModule/MaintenanceModule/ReviewsModule
  // import module này gọi invalidateAll() đúng lúc Device.status/avgRating đổi
  // do hành động của module đó (không phải do chính DevicesService gây ra).
  exports: [DevicesService, DevicesCacheService],
})
export class DevicesModule {}
