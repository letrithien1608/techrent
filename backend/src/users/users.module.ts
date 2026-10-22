import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // UploadModule là module "lá" (không import gì khác) — import thẳng để
  // UsersController sinh URL xem ảnh KYC có hạn (GET /users/:id/kyc-images)
  // và xoá ảnh KYC khi admin reset, không có rủi ro import cycle.
  imports: [UploadModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
