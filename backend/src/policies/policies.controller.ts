import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PoliciesService } from './policies.service';

@ApiTags('policies')
@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Public()
  @Get('rental')
  @ApiOperation({
    summary: 'Chính sách cọc/hoàn cọc/phí trễ hạn kèm ví dụ tính sẵn',
  })
  getRentalPolicy() {
    return this.policiesService.getRentalPolicy();
  }
}
