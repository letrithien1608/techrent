import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle, minutes } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AddCccdDto } from './dto/add-cccd.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequestUser } from './interfaces/jwt-payload.interface';

// Ảnh CCCD/chân dung thường nặng hơn hẳn ảnh thiết bị (chụp đủ sáng, rõ nét
// theo hướng dẫn eKYC) — 8MB/ảnh (so với 5MB cho ảnh thiết bị ở DevicesController).
const MAX_KYC_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;
type KycFile = { buffer: Buffer; mimetype: string; size: number };
type KycFilesPayload = {
  cccdFront?: KycFile[];
  cccdBack?: KycFile[];
  selfie?: KycFile[];
};

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

  /** Hồ sơ đầy đủ của chính mình (trang /profile) — khác /auth/profile chỉ trả thông tin trong token. */
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.authService.getMe(user.userId);
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

  /**
   * Khách hàng tự nộp eKYC: ảnh CCCD mặt trước + mặt sau + ảnh chân dung xác
   * thực, nộp 1 LẦN DUY NHẤT (chặn ở `AuthService.submitKycVerification()`
   * nếu đã nộp đủ — chỉ admin reset được). 3 field KHÁC TÊN (`cccdFront`/
   * `cccdBack`/`selfie`) nên dùng `FileFieldsInterceptor` (KHÁC
   * `FilesInterceptor` đang dùng cho ảnh thiết bị — đó là 1 field tên
   * `images` chứa NHIỀU file, còn đây là 3 field tên KHÁC NHAU, mỗi field
   * đúng 1 file).
   */
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Patch('kyc-verification')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'cccdFront', maxCount: 1 },
      { name: 'cccdBack', maxCount: 1 },
      { name: 'selfie', maxCount: 1 },
    ]),
  )
  submitKycVerification(
    @CurrentUser() user: RequestUser,
    @UploadedFiles() files: KycFilesPayload,
  ) {
    for (const [field, label] of [
      ['cccdFront', 'CCCD mặt trước'],
      ['cccdBack', 'CCCD mặt sau'],
      ['selfie', 'chân dung xác thực'],
    ] as const) {
      const file = files[field]?.[0];
      if (!file) {
        throw new BadRequestException(`Vui lòng tải lên ảnh ${label}`);
      }
      if (file.size > MAX_KYC_IMAGE_SIZE_BYTES) {
        throw new BadRequestException(
          `Ảnh ${label} vượt quá 8MB, vui lòng chọn ảnh nhỏ hơn`,
        );
      }
    }
    return this.authService.submitKycVerification(user.userId, files);
  }

  /**
   * Đổi ảnh đại diện của CHÍNH mình (field `avatar`). Multer chặn cứng 10MB
   * để bảo vệ bộ nhớ; giới hạn thật 5MB + loại JPG/PNG/WEBP kiểm tra lại ở
   * `AuthService.updateAvatar()` theo nội dung file (không tin frontend).
   */
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @Patch('avatar')
  @UseInterceptors(
    FileInterceptor('avatar', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  updateAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    return this.authService.updateAvatar(user.userId, file);
  }

  @ApiBearerAuth()
  @Delete('avatar')
  removeAvatar(@CurrentUser() user: RequestUser) {
    return this.authService.removeAvatar(user.userId);
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    await this.authService.verifyEmail(token);
    return { message: 'Xác thực email thành công' };
  }

  // Rate limit riêng (3 request/phút/IP — route @Public() nên getTracker tự
  // rơi về req.ip, không có req.user) — chống spam gửi email reset.
  @Public()
  @Throttle({ default: { limit: 3, ttl: minutes(1) } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return {
      message:
        'Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu',
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Đặt lại mật khẩu thành công' };
  }
}
