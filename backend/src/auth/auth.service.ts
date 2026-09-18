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
import { Role, User } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { SafeUser, UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  EmailVerificationPayload,
  JwtPayload,
} from './interfaces/jwt-payload.interface';

const PASSWORD_SALT_ROUNDS = 10;
const INVALID_CREDENTIALS_MESSAGE = 'Email hoặc mật khẩu không đúng';
const INVALID_VERIFICATION_TOKEN_MESSAGE =
  'Token xác thực email không hợp lệ hoặc đã hết hạn';
const INVALID_CURRENT_PASSWORD_MESSAGE = 'Mật khẩu hiện tại không đúng';

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

  async register(dto: RegisterDto): Promise<AuthTokens & { user: SafeUser }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      passwordHash,
      phone: dto.phone,
      role: Role.customer,
    });

    await this.sendVerificationEmail(user);

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.usersService.sanitize(user) };
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
    await this.blacklistAccessToken(accessToken);
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

    await this.blacklistAccessToken(accessToken);
    await this.usersService.updateRefreshTokenHash(user.id, null);
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

  private async blacklistAccessToken(accessToken: string): Promise<void> {
    const decoded = this.jwtService.decode(accessToken) as {
      exp?: number;
    } | null;
    const ttlSeconds = decoded?.exp
      ? decoded.exp - Math.floor(Date.now() / 1000)
      : 0;
    await this.redisService.blacklistToken(accessToken, ttlSeconds);
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
