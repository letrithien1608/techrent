import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Role, User } from '../generated/prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    findByIdOrThrow: jest.Mock;
    create: jest.Mock;
    updateRefreshTokenHash: jest.Mock;
    markEmailVerified: jest.Mock;
    sanitize: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
    decode: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let redisService: {
    blacklistToken: jest.Mock;
    isTokenBlacklisted: jest.Mock;
  };
  let mailService: { sendVerificationEmail: jest.Mock };

  const baseUser: User = {
    id: 'user-1',
    name: 'Nguyễn Văn A',
    email: 'user@example.com',
    passwordHash: '',
    refreshTokenHash: null,
    role: Role.customer,
    phone: null,
    cccdEncrypted: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const configValues: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
    EMAIL_VERIFICATION_SECRET: 'email-verification-secret',
    EMAIL_VERIFICATION_EXPIRES_IN: '24h',
    PORT: '3001',
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByIdOrThrow: jest.fn(),
      create: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      markEmailVerified: jest.fn(),
      sanitize: jest.fn((user: User) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        emailVerifiedAt: user.emailVerifiedAt,
        createdAt: user.createdAt,
      })),
    };
    jwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
      decode: jest.fn(),
    };
    configService = { get: jest.fn((key: string) => configValues[key]) };
    redisService = { blacklistToken: jest.fn(), isTokenBlacklisted: jest.fn() };
    mailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      usersService as any,
      jwtService as any,
      configService as any,
      redisService as any,
      mailService as any,
    );

    // Mỗi lần issueTokens() gọi 2 lần signAsync (access rồi refresh) trong 1 Promise.all;
    // sendVerificationEmail (trong register) gọi thêm 1 lần signAsync với secret verification
    jwtService.signAsync.mockImplementation((_payload: any, opts: any) => {
      if (opts.secret === configValues.JWT_ACCESS_SECRET)
        return Promise.resolve('access-token');
      if (opts.secret === configValues.JWT_REFRESH_SECRET)
        return Promise.resolve('refresh-token');
      return Promise.resolve('email-verification-token');
    });
  });

  describe('register', () => {
    it('ném ConflictException nếu email đã tồn tại', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);

      await expect(
        service.register({
          name: 'A',
          email: baseUser.email,
          password: 'Str0ngP@ssword',
        }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('tạo user mới với password đã bcrypt-hash và role mặc định customer', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation((data: any) =>
        Promise.resolve({ ...baseUser, ...data, refreshTokenHash: null }),
      );

      const result = await service.register({
        name: 'Nguyễn Văn A',
        email: 'new@example.com',
        password: 'Str0ngP@ssword',
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          role: Role.customer,
        }),
      );
      const createdArg = usersService.create.mock.calls[0][0];
      expect(createdArg.passwordHash).not.toBe('Str0ngP@ssword');
      expect(
        await bcrypt.compare('Str0ngP@ssword', createdArg.passwordHash),
      ).toBe(true);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('refreshTokenHash');

      // refresh token phải được hash (SHA-256, không phải plaintext) trước khi lưu DB
      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        baseUser.id,
        expect.not.stringMatching('refresh-token'),
      );
    });

    it('gửi email xác thực chứa link kèm token sau khi tạo user', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        ...baseUser,
        email: 'new@example.com',
      });

      await service.register({
        name: 'Nguyễn Văn A',
        email: 'new@example.com',
        password: 'Str0ngP@ssword',
      });

      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        'new@example.com',
        baseUser.name,
        expect.stringContaining('email-verification-token'),
      );
    });
  });

  describe('login', () => {
    it('ném UnauthorizedException nếu không tìm thấy user', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('ném UnauthorizedException nếu sai mật khẩu', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 10);
      usersService.findByEmail.mockResolvedValue({ ...baseUser, passwordHash });

      await expect(
        service.login({ email: baseUser.email, password: 'WrongPass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('trả về access + refresh token khi đăng nhập đúng', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 10);
      usersService.findByEmail.mockResolvedValue({ ...baseUser, passwordHash });

      const result = await service.login({
        email: baseUser.email,
        password: 'CorrectPass1',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(usersService.updateRefreshTokenHash).toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('ném UnauthorizedException nếu token sai chữ ký / hết hạn', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.refreshTokens('bad-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('ném UnauthorizedException nếu user không còn refreshTokenHash (đã logout)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
      usersService.findById.mockResolvedValue({
        ...baseUser,
        refreshTokenHash: null,
      });

      await expect(service.refreshTokens('some-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('ném UnauthorizedException nếu refresh token đã bị rotate (không khớp hash lưu trong DB)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
      usersService.findById.mockResolvedValue({
        ...baseUser,
        refreshTokenHash: 'hash-cua-token-khac',
      });

      await expect(
        service.refreshTokens('old-rotated-out-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('cấp cặp token mới khi refresh token hợp lệ và khớp hash trong DB', async () => {
      const currentRefreshToken = 'current-refresh-token';
      const storedHash = createHash('sha256')
        .update(currentRefreshToken)
        .digest('hex');

      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        role: baseUser.role,
      });
      usersService.findById.mockResolvedValue({
        ...baseUser,
        refreshTokenHash: storedHash,
      });

      const result = await service.refreshTokens(currentRefreshToken);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      // DB phải được cập nhật sang hash của refresh token MỚI (rotation)
      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        baseUser.id,
        expect.any(String),
      );
      expect(usersService.updateRefreshTokenHash.mock.calls[0][1]).not.toBe(
        storedHash,
      );
    });
  });

  describe('logout', () => {
    it('blacklist access token trong Redis với TTL đúng bằng thời gian còn lại tới khi hết hạn', async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      jwtService.decode.mockReturnValue({ exp: nowSeconds + 120 });

      await service.logout(baseUser.id, 'some-access-token');

      expect(redisService.blacklistToken).toHaveBeenCalledWith(
        'some-access-token',
        expect.any(Number),
      );
      const ttlArg = redisService.blacklistToken.mock.calls[0][1];
      expect(ttlArg).toBeGreaterThan(100);
      expect(ttlArg).toBeLessThanOrEqual(120);
    });

    it('xoá refreshTokenHash của user để thu hồi luôn refresh token (không thể refresh sau logout)', async () => {
      jwtService.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      await service.logout(baseUser.id, 'some-access-token');

      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        baseUser.id,
        null,
      );
    });
  });

  describe('verifyEmail', () => {
    it('ném BadRequestException nếu token sai chữ ký / hết hạn', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.verifyEmail('bad-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('ném BadRequestException nếu token không có purpose "email-verification" (chống dùng nhầm access token)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        purpose: 'something-else',
      });

      await expect(service.verifyEmail('some-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usersService.markEmailVerified).not.toHaveBeenCalled();
    });

    it('ném NotFoundException nếu không tìm thấy user', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'ghost-id',
        purpose: 'email-verification',
      });
      usersService.findById.mockResolvedValue(null);

      await expect(service.verifyEmail('some-token')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('đánh dấu emailVerifiedAt khi token hợp lệ và email chưa xác thực', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        purpose: 'email-verification',
      });
      usersService.findById.mockResolvedValue({
        ...baseUser,
        emailVerifiedAt: null,
      });

      await service.verifyEmail('valid-token');

      expect(usersService.markEmailVerified).toHaveBeenCalledWith(baseUser.id);
    });

    it('không gọi lại markEmailVerified nếu email đã xác thực từ trước (idempotent)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        purpose: 'email-verification',
      });
      usersService.findById.mockResolvedValue({
        ...baseUser,
        emailVerifiedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      await service.verifyEmail('valid-token');

      expect(usersService.markEmailVerified).not.toHaveBeenCalled();
    });
  });
});
