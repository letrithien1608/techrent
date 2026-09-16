import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @Post('vnpay/create')
  createVnpayUrl(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreatePaymentDto,
    @Req() req: Request,
  ) {
    const ipAddr = req.ip ?? '127.0.0.1';
    return this.paymentsService.createPaymentUrl(
      user.userId,
      dto.bookingId,
      ipAddr,
    );
  }

  // VNPay gọi thẳng server-to-server, không kèm access token — đây là nguồn xác
  // nhận thanh toán DUY NHẤT được tin cậy (xem PaymentsService.handleIpn).
  @Public()
  @Get('vnpay/ipn')
  handleIpn(@Query() query: Record<string, string>) {
    return this.paymentsService.handleIpn(query);
  }

  // Trình duyệt khách redirect về đây sau khi thanh toán — chỉ để hiển thị,
  // không ghi DB (nguồn xác nhận thật là IPN ở trên).
  @Public()
  @Get('vnpay/return')
  verifyReturn(@Query() query: Record<string, string>) {
    return {
      valid: this.paymentsService.verifyReturnChecksum(query),
      responseCode: query.vnp_ResponseCode,
      txnRef: query.vnp_TxnRef,
    };
  }

  @ApiBearerAuth()
  @Get('booking/:bookingId')
  getPaymentForBooking(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.getPaymentStatusForBooking(bookingId, user);
  }
}
