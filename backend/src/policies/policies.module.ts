import { Module } from '@nestjs/common';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';

/** Module "lá" — chỉ đọc hằng số business-policy.ts + ConfigService (global). */
@Module({
  controllers: [PoliciesController],
  providers: [PoliciesService],
})
export class PoliciesModule {}
