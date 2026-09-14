import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { Role, User } from '../generated/prisma/client';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const PASSWORD_SALT_ROUNDS = 10;
const INVALID_CREDENTIALS_MESSAGE = 'Email hoặc mật khẩu không đúng';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
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

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.sanitizeUser(user) };
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
    return { ...tokens, user: this.sanitizeUser(user) };
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

  private sanitizeUser(user: User): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      createdAt: user.createdAt,
    };
  }
}
