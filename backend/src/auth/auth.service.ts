import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import {
  encryptCccd,
  hashCccd,
  maskCccd,
} from '../common/crypto/cccd-crypto.util';
import { translateUniqueConstraintError } from '../common/prisma-error.util';
import { Role, User } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { SafeUser, UsersService } from '../users/users.service';
import { AddCccdDto } from './dto/add-cccd.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  EmailVerificationPayload,
  JwtPayload,
  PasswordResetPayload,
} from './interfaces/jwt-payload.interface';

const PASSWORD_SALT_ROUNDS = 10;
const INVALID_CREDENTIALS_MESSAGE = 'Email hoặc mật khẩu không đúng';
const INVALID_VERIFICATION_TOKEN_MESSAGE =
  'Token xác thực email không hợp lệ hoặc đã hết hạn';
const INVALID_RESET_TOKEN_MESSAGE =
  'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn';
const INVALID_CURRENT_PASSWORD_MESSAGE = 'Mật khẩu hiện tại không đúng';
const DUPLICATE_CCCD_MESSAGE =
  'Số CCCD này đã được đăng ký bởi một tài khoản khác';
const DUPLICATE_PHONE_MESSAGE =
  'Số điện thoại này đã được đăng ký bởi một tài khoản khác';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
  ) {}

  /**
   * KYC bắt buộc từ khi triển khai chống-1-người-nhiều-tài-khoản (mục 7
   * Roadmap): mỗi tài khoản "sạch" mới tạo rất khó bị chặn nếu không gắn với
   * 1 định danh duy nhất (CCCD). Kiểm tra trùng CCCD qua hash TRƯỚC KHI tạo
   * user để trả lỗi rõ ràng ngay — KHÔNG tiết lộ email/thông tin tài khoản
   * đang giữ CCCD đó (tránh dò thông tin người khác qua message lỗi).
   *
   * Unique constraint cấp DATABASE trên `cccd_hash`/`phone` (xem schema) vẫn
   * là lớp bảo vệ CUỐI CÙNG chống race condition — `translateUniqueConstraintError`
   * bắt lại nếu 2 request đăng ký cùng CCCD/SĐT lọt qua pre-check vì chạy
   * gần như đồng thời.
   */
  async register(dto: RegisterDto): Promise<AuthTokens & { user: SafeUser }> {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const cccdHash = hashCccd(dto.cccd);
    const existingCccd = await this.usersService.findByCccdHash(cccdHash);
    if (existingCccd) {
      throw new ConflictException(DUPLICATE_CCCD_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    const encryptionKey = this.getCccdEncryptionKey();

    let user: User;
    try {
      user = await this.usersService.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
        phone: dto.phone,
        cccdHash,
        cccdEncrypted: encryptCccd(dto.cccd, encryptionKey),
        cccdMasked: maskCccd(dto.cccd),
        role: Role.customer,
      });
    } catch (error) {
      throw translateUniqueConstraintError(error, {
        phone: DUPLICATE_PHONE_MESSAGE,
        cccd: DUPLICATE_CCCD_MESSAGE,
      });
    }

    await this.sendVerificationEmail(user);

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.usersService.sanitize(user) };
  }

  /**
   * Khách hàng bổ sung CCCD SAU KHI đã đăng ký — dành cho tài khoản cũ tạo
   * trước khi tính năng KYC này tồn tại (`cccdHash` NULL trong DB). Không cho
   * SỬA lại CCCD đã có (dữ liệu định danh, không nên đổi tuỳ tiện — đổi thật
   * sự cần thì phải là luồng riêng có xác minh thêm, ngoài phạm vi hiện tại).
   */
  async addCccd(userId: string, dto: AddCccdDto): Promise<SafeUser> {
    const user = await this.usersService.findByIdOrThrow(userId);
    if (user.cccdHash) {
      throw new BadRequestException(
        'Tài khoản đã có CCCD trong hồ sơ, không thể tự đổi — liên hệ hỗ trợ nếu cần cập nhật',
      );
    }

    const cccdHash = hashCccd(dto.cccd);
    const existingCccd = await this.usersService.findByCccdHash(cccdHash);
    if (existingCccd) {
      throw new ConflictException(DUPLICATE_CCCD_MESSAGE);
    }

    const encryptionKey = this.getCccdEncryptionKey();
    try {
      const updated = await this.usersService.update(
        userId,
        {
          cccdHash,
          cccdEncrypted: encryptCccd(dto.cccd, encryptionKey),
          cccdMasked: maskCccd(dto.cccd),
        },
        userId,
      );
      return this.usersService.sanitize(updated);
    } catch (error) {
      throw translateUniqueConstraintError(error, { cccd: DUPLICATE_CCCD_MESSAGE });
    }
  }

  async login(dto: LoginDto): Promise<AuthTokens & { user: SafeUser }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.usersService.sanitize(user) };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    const refreshTokenMatches = this.compareTokenHash(
      refreshToken,
      user.refreshTokenHash,
    );
    if (!refreshTokenMatches) {
      throw new UnauthorizedException(
        'Refresh token không hợp lệ hoặc đã hết hạn',
      );
    }

    return this.issueTokens(user);
  }

  async logout(userId: string, accessToken: string): Promise<void> {
    await this.blacklistTokenUntilExpiry(accessToken);
    await this.usersService.updateRefreshTokenHash(userId, null);
  }

  /**
   * Khách hàng TỰ đổi mật khẩu của chính mình — KHÁC hẳn `PATCH /users/:id`
   * (dành cho admin, đổi được mật khẩu của bất kỳ ai mà KHÔNG cần biết mật
   * khẩu cũ). Ở đây bắt buộc verify `currentPassword` trước, chống trường
   * hợp ai đó chiếm được access token tạm thời rồi tự đổi mật khẩu chiếm
   * quyền dài hạn tài khoản.
   *
   * Sau khi đổi thành công, coi access/refresh token hiện tại là KHÔNG còn
   * đáng tin (cùng nguyên tắc với `logout()`) — blacklist access token +
   * xoá refresh token hash, bắt đăng nhập lại bằng mật khẩu mới.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    accessToken: string,
  ): Promise<void> {
    const user = await this.usersService.findByIdOrThrow(userId);

    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordMatches) {
      throw new UnauthorizedException(INVALID_CURRENT_PASSWORD_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      PASSWORD_SALT_ROUNDS,
    );
    await this.usersService.update(user.id, { passwordHash }, user.id);

    await this.blacklistTokenUntilExpiry(accessToken);
    await this.usersService.updateRefreshTokenHash(user.id, null);
  }

  /**
   * Luôn trả về `void` (thành công) dù email có tồn tại trong hệ thống hay
   * không — tránh lộ email nào đã đăng ký qua phản hồi khác nhau, CÙNG
   * nguyên tắc đã áp dụng cho message lỗi trùng CCCD (xem `register()`).
   * Controller rate-limit endpoint này qua `@Throttle` để chống spam gửi
   * email (xem `AuthController`).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.log(
        `Yêu cầu đặt lại mật khẩu cho email không tồn tại: ${dto.email}`,
      );
      return;
    }

    await this.sendPasswordResetEmail(user);
  }

  /**
   * Verify token (secret + purpose RIÊNG, giống `verifyEmail()`), hash mật
   * khẩu mới, rồi THU HỒI refresh token hiện có của user (cùng tinh thần
   * `changePassword()` — coi phiên đăng nhập cũ không còn đáng tin sau khi
   * đổi mật khẩu). Khác `changePassword()`: người gọi ở đây CHƯA đăng nhập
   * (không có access token hiện tại trong tay để blacklist riêng) — access
   * token cũ (nếu còn) tự hết hạn sau tối đa 15 phút như bình thường.
   *
   * ⚠️ Reset token PHẢI chỉ dùng được ĐÚNG 1 LẦN — khác `verifyEmail()` (token
   * đó idempotent, gọi lại vô hại vì chỉ set 1 cờ `emailVerifiedAt`). Nếu
   * không chặn, 1 reset token bị lộ (VD lưu trong lịch sử trình duyệt/log
   * proxy/email bị forward) cho phép đổi mật khẩu người dùng NHIỀU LẦN tuỳ ý
   * trong suốt 15 phút còn hạn — kể cả SAU KHI chính chủ đã dùng token đó đổi
   * mật khẩu của mình. Dùng lại CHÍNH blacklist Redis đang dùng cho access
   * token (`blacklistTokenUntilExpiry`, đổi tên từ `blacklistAccessToken` vì
   * giờ dùng cho cả 2 loại token) — không cần hạ tầng mới.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    if (await this.redisService.isTokenBlacklisted(dto.token)) {
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }

    let payload: PasswordResetPayload;
    try {
      payload = await this.jwtService.verifyAsync<PasswordResetPayload>(
        dto.token,
        {
          secret: this.configService.get<string>('PASSWORD_RESET_SECRET'),
        },
      );
    } catch {
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }

    if (payload.purpose !== 'password-reset') {
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      PASSWORD_SALT_ROUNDS,
    );
    await this.usersService.update(user.id, { passwordHash }, user.id);
    await this.usersService.updateRefreshTokenHash(user.id, null);
    await this.blacklistTokenUntilExpiry(dto.token);
  }

  async verifyEmail(token: string): Promise<void> {
    let payload: EmailVerificationPayload;
    try {
      payload = await this.jwtService.verifyAsync<EmailVerificationPayload>(
        token,
        {
          secret: this.configService.get<string>('EMAIL_VERIFICATION_SECRET'),
        },
      );
    } catch {
      throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
    }

    if (payload.purpose !== 'email-verification') {
      throw new BadRequestException(INVALID_VERIFICATION_TOKEN_MESSAGE);
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (!user.emailVerifiedAt) {
      await this.usersService.markEmailVerified(user.id);
    }
  }

  private getCccdEncryptionKey(): string {
    return this.configService.get<string>('CCCD_ENCRYPTION_KEY')!;
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        purpose: 'email-verification',
      } satisfies EmailVerificationPayload,
      {
        secret: this.configService.get<string>('EMAIL_VERIFICATION_SECRET'),
        expiresIn: this.configService.get<string>(
          'EMAIL_VERIFICATION_EXPIRES_IN',
        ) as StringValue,
      },
    );

    const apiBaseUrl = `http://localhost:${this.configService.get<string>('PORT') ?? '3001'}`;
    const verificationUrl = `${apiBaseUrl}/auth/verify-email?token=${token}`;

    this.logger.log(`Gửi email xác thực cho ${user.email}`);
    await this.mailService.sendVerificationEmail(
      user.email,
      user.name,
      verificationUrl,
    );
  }

  /**
   * Link reset trỏ vào trang FRONTEND (`/reset-password?token=...`, người
   * dùng nhập mật khẩu mới ở đó rồi frontend gọi `POST /auth/reset-password`)
   * — KHÁC link xác thực email (trỏ thẳng vào backend). Dùng lại `CORS_ORIGIN`
   * làm base URL frontend (đã là "origin của frontend" theo đúng nghĩa dùng
   * cho CORS từ đầu dự án), không thêm biến môi trường mới trùng ý nghĩa.
   */
  private async sendPasswordResetEmail(user: User): Promise<void> {
    const token = await this.jwtService.signAsync(
      {
        sub: user.id,
        purpose: 'password-reset',
      } satisfies PasswordResetPayload,
      {
        secret: this.configService.get<string>('PASSWORD_RESET_SECRET'),
        expiresIn: this.configService.get<string>(
          'PASSWORD_RESET_EXPIRES_IN',
        ) as StringValue,
      },
    );

    const frontendBaseUrl =
      this.configService.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
    const resetUrl = `${frontendBaseUrl}/reset-password?token=${token}`;

    this.logger.log(`Gửi email đặt lại mật khẩu cho ${user.email}`);
    await this.mailService.sendPasswordResetEmail(
      user.email,
      user.name,
      resetUrl,
    );
  }

  /**
   * Dùng cho CẢ access token (logout/changePassword) VÀ reset-password token
   * (resetPassword) — cả 2 đều cần "vô hiệu hoá sớm, tới đúng lúc hết hạn tự
   * nhiên" nên dùng chung 1 cơ chế, chỉ khác secret/nội dung payload.
   */
  private async blacklistTokenUntilExpiry(token: string): Promise<void> {
    const decoded = this.jwtService.decode(token) as {
      exp?: number;
    } | null;
    const ttlSeconds = decoded?.exp
      ? decoded.exp - Math.floor(Date.now() / 1000)
      : 0;
    await this.redisService.blacklistToken(token, ttlSeconds);
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: randomUUID(),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
        ) as StringValue,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
        ) as StringValue,
      }),
    ]);

    await this.usersService.updateRefreshTokenHash(
      user.id,
      this.hashToken(refreshToken),
    );

    return { accessToken, refreshToken };
  }

  /**
   * Refresh token là chuỗi JWT dài, có tiền tố giống nhau giữa các lần cấp (cùng header +
   * cùng sub/email/role) — bcrypt chỉ đọc 72 byte đầu nên KHÔNG được dùng để hash JWT (sẽ
   * coi các token cũ/mới là giống nhau). Dùng SHA-256 (đọc toàn bộ chuỗi) để lưu/so khớp.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private compareTokenHash(token: string, storedHash: string): boolean {
    const tokenHash = Buffer.from(this.hashToken(token), 'hex');
    const stored = Buffer.from(storedHash, 'hex');
    return (
      tokenHash.length === stored.length && timingSafeEqual(tokenHash, stored)
    );
  }
}
