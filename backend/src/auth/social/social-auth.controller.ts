import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from '../auth.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { RequestUser } from '../interfaces/jwt-payload.interface';
import { SocialAuthService } from './social-auth.service';
import {
  SetPasswordDto,
  SocialExchangeDto,
  SocialRegisterDto,
} from './social-register.dto';

/**
 * Đăng nhập/đăng ký bằng Google/Facebook. Rate limit: dùng giới hạn mặc định
 * toàn cục (100 request/phút/IP hoặc /user) GIỐNG HỆT `POST /auth/login` và
 * `POST /auth/register`. Callback cố định `/auth/<provider>/callback` (2 đoạn
 * path — không đụng các route 1 đoạn như `/auth/me`).
 */
@ApiTags('auth')
@Controller('auth')
export class SocialAuthController {
  constructor(
    private readonly socialAuthService: SocialAuthService,
    private readonly authService: AuthService,
  ) {}

  /** Provider nào đang bật (đủ biến môi trường) — frontend chỉ hiện nút của các provider này. */
  @Public()
  @Get('social/providers')
  providers() {
    return { providers: this.socialAuthService.enabledProviders() };
  }

  @Public()
  @Get(':provider/start')
  async start(@Param('provider') provider: string, @Res() res: Response) {
    res.redirect(
      HttpStatus.FOUND,
      await this.socialAuthService.startLogin(provider),
    );
  }

  @Public()
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    res.redirect(
      HttpStatus.FOUND,
      await this.socialAuthService.handleCallback(provider, {
        code,
        state,
        error,
      }),
    );
  }

  @Public()
  @Get('social/ticket/:ticket')
  ticket(@Param('ticket') ticket: string) {
    return this.socialAuthService.getTicket(ticket);
  }

  @Public()
  @Post('social/register')
  register(@Body() dto: SocialRegisterDto) {
    return this.socialAuthService.register(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('social/exchange')
  exchange(@Body() dto: SocialExchangeDto) {
    return this.socialAuthService.exchange(dto.code);
  }

  /** Người đang đăng nhập liên kết thêm Google/Facebook: trả URL để trình duyệt chuyển tới. */
  @ApiBearerAuth()
  @Post('social/:provider/link')
  async link(
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
  ) {
    return {
      url: await this.socialAuthService.startLink(provider, user.userId),
    };
  }

  @ApiBearerAuth()
  @Get('social/accounts')
  accounts(@CurrentUser() user: RequestUser) {
    return this.socialAuthService.listAccounts(user.userId);
  }

  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('social/accounts/:provider')
  async unlink(
    @CurrentUser() user: RequestUser,
    @Param('provider') provider: string,
  ) {
    await this.socialAuthService.unlink(user.userId, provider);
  }

  /** Tài khoản chưa có mật khẩu (đăng ký bằng mạng xã hội) tự đặt mật khẩu để đăng nhập thêm bằng email. */
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Post('set-password')
  setPassword(@CurrentUser() user: RequestUser, @Body() dto: SetPasswordDto) {
    return this.authService.setPassword(user.userId, dto.newPassword);
  }
}
