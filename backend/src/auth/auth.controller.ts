import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AddCccdDto } from './dto/add-cccd.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestUser } from './interfaces/jwt-payload.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@CurrentUser() user: RequestUser, @Req() req: Request) {
    const accessToken = req.headers.authorization?.replace('Bearer ', '') ?? '';
    await this.authService.logout(user.userId, accessToken);
  }

  @ApiBearerAuth()
  @Get('profile')
  profile(@CurrentUser() user: RequestUser) {
    return user;
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const accessToken = req.headers.authorization?.replace('Bearer ', '') ?? '';
    await this.authService.changePassword(user.userId, dto, accessToken);
    return { message: 'Đổi mật khẩu thành công' };
  }

  /**
   * Khách hàng tự bổ sung CCCD (cho tài khoản cũ tạo trước khi có KYC, hoặc
   * ai chưa có sẵn). Trả về `SafeUser` đã sanitize (chỉ `cccdMasked`, không
   * bao giờ trả CCCD đầy đủ) — frontend dùng thẳng để cập nhật lại Zustand
   * store, không cần gọi lại `/auth/profile`.
   */
  @ApiBearerAuth()
  @Patch('cccd')
  addCccd(@CurrentUser() user: RequestUser, @Body() dto: AddCccdDto) {
    return this.authService.addCccd(user.userId, dto);
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    await this.authService.verifyEmail(token);
    return { message: 'Xác thực email thành công' };
  }
}
