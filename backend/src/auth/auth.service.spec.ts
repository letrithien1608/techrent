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
    findByCccdHash: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
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
  let mailService: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
  };
  let uploadService: {
    uploadKycImage: jest.Mock;
    uploadAvatar: jest.Mock;
    deletePublicImage: jest.Mock;
  };

  const baseUser: User = {
    id: 'user-1',
    name: 'Nguyễn Văn A',
    email: 'user@example.com',
    passwordHash: '',
    refreshTokenHash: null,
    role: Role.customer,
    phone: null,
    cccdHash: null,
    cccdEncrypted: null,
    cccdMasked: null,
    kycCccdFrontPublicId: null,
    kycCccdBackPublicId: null,
    kycSelfiePublicId: null,
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    isBlacklisted: false,
    blacklistReason: null,
    blacklistedAt: null,
    avatarPublicId: null,
    avatarUrl: null,
  };

  // 32 byte (64 ký tự hex) — đúng chuẩn AES-256 đọc từ CCCD_ENCRYPTION_KEY.
  const cccdEncryptionKey =
    '5087b9960945283af522f534d221642dd7aac08c5f53f57bded1453b90a1f480';

  const configValues: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRES_IN: '7d',
    EMAIL_VERIFICATION_SECRET: 'email-verification-secret',
    EMAIL_VERIFICATION_EXPIRES_IN: '24h',
    PASSWORD_RESET_SECRET: 'password-reset-secret',
    PASSWORD_RESET_EXPIRES_IN: '15m',
    CORS_ORIGIN: 'http://localhost:3000',
    PORT: '3001',
    CCCD_ENCRYPTION_KEY: cccdEncryptionKey,
  };

  // Payload đăng ký hợp lệ dùng lại ở nhiều test — phone/cccd giờ BẮT BUỘC.
  const validRegisterDto = {
    name: 'Nguyễn Văn A',
    email: 'new@example.com',
    password: 'Str0ngP@ssword',
    phone: '0901234567',
    cccd: '079203012345',
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByIdOrThrow: jest.fn(),
      findByCccdHash: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateRefreshTokenHash: jest.fn(),
      markEmailVerified: jest.fn(),
      sanitize: jest.fn((user: User) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        cccdMasked: user.cccdMasked,
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
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    uploadService = {
      uploadKycImage: jest.fn().mockResolvedValue('kyc/mock-public-id'),
      uploadAvatar: jest.fn().mockResolvedValue({
        publicId: 'techrent/avatars/new',
        url: 'https://res.cloudinary.com/demo/image/upload/v2/techrent/avatars/new.jpg',
      }),
      deletePublicImage: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      usersService as any,
      jwtService as any,
      configService as any,
      redisService as any,
      mailService as any,
      uploadService as any,
    );

    // Mỗi lần issueTokens() gọi 2 lần signAsync (access rồi refresh) trong 1 Promise.all;
    // sendVerificationEmail (trong register) gọi thêm 1 lần signAsync với secret verification
    jwtService.signAsync.mockImplementation((_payload: any, opts: any) => {
      if (opts.secret === configValues.JWT_ACCESS_SECRET)
        return Promise.resolve('access-token');
      if (opts.secret === configValues.JWT_REFRESH_SECRET)
        return Promise.resolve('refresh-token');
      if (opts.secret === configValues.PASSWORD_RESET_SECRET)
        return Promise.resolve('password-reset-token');
      return Promise.resolve('email-verification-token');
    });
  });

  describe('register', () => {
    it('ném ConflictException nếu email đã tồn tại', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);

      await expect(
        service.register({ ...validRegisterDto, email: baseUser.email }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersService.create).not.toHaveBeenCalled();
      // Không cần tốn công kiểm tra CCCD nếu email đã trùng — thất bại sớm.
      expect(usersService.findByCccdHash).not.toHaveBeenCalled();
    });

    it('ném ConflictException nếu CCCD đã được đăng ký bởi tài khoản khác — KHÔNG tiết lộ thông tin tài khoản kia', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findByCccdHash.mockResolvedValue({
        ...baseUser,
        id: 'someone-else',
        email: 'other-person@example.com',
      });

      const error: unknown = await service
        .register(validRegisterDto)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).message).not.toContain(
        'other-person@example.com',
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('tạo user mới với password đã bcrypt-hash, role mặc định customer, và CCCD được hash+mã hoá+mask', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation((data: any) =>
        Promise.resolve({ ...baseUser, ...data, refreshTokenHash: null }),
      );

      const result = await service.register(validRegisterDto);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          role: Role.customer,
          cccdHash: expect.any(String),
          cccdEncrypted: expect.any(String),
          cccdMasked: '********2345',
        }),
      );
      const createdArg = usersService.create.mock.calls[0][0];
      expect(createdArg.passwordHash).not.toBe('Str0ngP@ssword');
      expect(
        await bcrypt.compare('Str0ngP@ssword', createdArg.passwordHash),
      ).toBe(true);
      // cccdHash/cccdEncrypted KHÔNG được chứa CCCD gốc dạng thô.
      expect(createdArg.cccdHash).not.toBe(validRegisterDto.cccd);
      expect(createdArg.cccdEncrypted).not.toContain(validRegisterDto.cccd);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result.user).not.toHaveProperty('refreshTokenHash');
      expect(result.user).not.toHaveProperty('cccdHash');
      expect(result.user).not.toHaveProperty('cccdEncrypted');

      // refresh token phải được hash (SHA-256, không phải plaintext) trước khi lưu DB
      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        baseUser.id,
        expect.not.stringMatching('refresh-token'),
      );
    });

    it('dịch lỗi P2002 (trùng phone, lọt qua race condition) thành ConflictException thân thiện', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const { Prisma } = await import('../generated/prisma/client');
      usersService.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['phone'] },
        }),
      );

      await expect(service.register(validRegisterDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('gửi email xác thực chứa link kèm token sau khi tạo user', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        ...baseUser,
        email: 'new@example.com',
      });

      await service.register(validRegisterDto);

      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        'new@example.com',
        baseUser.name,
        expect.stringContaining('email-verification-token'),
      );
    });
  });

  describe('addCccd', () => {
    const dto = { cccd: '079203012345' };

    it('ném BadRequestException nếu tài khoản đã có CCCD (không cho tự đổi)', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        ...baseUser,
        cccdHash: 'a'.repeat(64),
      });

      await expect(service.addCccd(baseUser.id, dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('ném ConflictException nếu CCCD đã được đăng ký bởi tài khoản khác', async () => {
      usersService.findByIdOrThrow.mockResolvedValue(baseUser);
      usersService.findByCccdHash.mockResolvedValue({
        ...baseUser,
        id: 'someone-else',
      });

      await expect(service.addCccd(baseUser.id, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('bổ sung CCCD hợp lệ thành công — lưu hash+mã hoá+mask, trả về user đã sanitize', async () => {
      usersService.findByIdOrThrow.mockResolvedValue(baseUser);
      usersService.findByCccdHash.mockResolvedValue(null);
      usersService.update.mockImplementation((_id, data: any) =>
        Promise.resolve({ ...baseUser, ...data }),
      );

      const result = await service.addCccd(baseUser.id, dto);

      expect(usersService.update).toHaveBeenCalledWith(
        baseUser.id,
        expect.objectContaining({
          cccdHash: expect.any(String),
          cccdEncrypted: expect.any(String),
          cccdMasked: '********2345',
        }),
        baseUser.id,
      );
      expect(result.cccdMasked).toBe('********2345');
      expect(result).not.toHaveProperty('cccdHash');
      expect(result).not.toHaveProperty('cccdEncrypted');
    });
  });

  describe('submitKycVerification', () => {
    const makeFile = (tag: string) => [
      { buffer: Buffer.from(tag), mimetype: 'image/jpeg' },
    ];
    const validFiles = {
      cccdFront: makeFile('front'),
      cccdBack: makeFile('back'),
      selfie: makeFile('selfie'),
    };

    it('ném BadRequestException nếu đã nộp đủ 3 ảnh KYC từ trước (không cho tự nộp lại)', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        ...baseUser,
        kycCccdFrontPublicId: 'kyc/u1-cccd-front',
        kycCccdBackPublicId: 'kyc/u1-cccd-back',
        kycSelfiePublicId: 'kyc/u1-selfie',
      });

      await expect(
        service.submitKycVerification(baseUser.id, validFiles),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(uploadService.uploadKycImage).not.toHaveBeenCalled();
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu thiếu 1 trong 3 ảnh (VD thiếu selfie)', async () => {
      usersService.findByIdOrThrow.mockResolvedValue(baseUser);

      await expect(
        service.submitKycVerification(baseUser.id, {
          cccdFront: makeFile('front'),
          cccdBack: makeFile('back'),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(uploadService.uploadKycImage).not.toHaveBeenCalled();
    });

    it('upload đủ 3 ảnh với publicId riêng biệt theo đúng userId+slot, lưu lại 3 public_id, trả về user đã sanitize', async () => {
      usersService.findByIdOrThrow.mockResolvedValue(baseUser);
      uploadService.uploadKycImage.mockImplementation(
        (_buffer: Buffer, _mimetype: string, publicId: string) =>
          Promise.resolve(publicId),
      );
      usersService.update.mockImplementation((_id, data: any) =>
        Promise.resolve({ ...baseUser, ...data }),
      );

      const result = await service.submitKycVerification(
        baseUser.id,
        validFiles,
      );

      expect(uploadService.uploadKycImage).toHaveBeenCalledWith(
        validFiles.cccdFront[0].buffer,
        'image/jpeg',
        `kyc-${baseUser.id}-cccd-front`,
      );
      expect(uploadService.uploadKycImage).toHaveBeenCalledWith(
        validFiles.cccdBack[0].buffer,
        'image/jpeg',
        `kyc-${baseUser.id}-cccd-back`,
      );
      expect(uploadService.uploadKycImage).toHaveBeenCalledWith(
        validFiles.selfie[0].buffer,
        'image/jpeg',
        `kyc-${baseUser.id}-selfie`,
      );
      expect(usersService.update).toHaveBeenCalledWith(
        baseUser.id,
        {
          kycCccdFrontPublicId: `kyc-${baseUser.id}-cccd-front`,
          kycCccdBackPublicId: `kyc-${baseUser.id}-cccd-back`,
          kycSelfiePublicId: `kyc-${baseUser.id}-selfie`,
        },
        baseUser.id,
      );
      expect(result).not.toHaveProperty('kycCccdFrontPublicId');
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

    it('tài khoản không mật khẩu (đăng ký bằng mạng xã hội) KHÔNG đăng nhập thường được, cùng thông báo chung', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
      });

      await expect(
        service.login({ email: baseUser.email, password: 'whatever1' }),
      ).rejects.toThrow('Email hoặc mật khẩu không đúng');
      expect(usersService.updateRefreshTokenHash).not.toHaveBeenCalled();
    });
  });

  describe('đăng nhập mạng xã hội — phần dùng chung trong AuthService', () => {
    it('createCustomerAccount: email provider đã xác minh → đặt emailVerifiedAt, tạo kèm social account, KHÔNG gửi email xác thực', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({ ...baseUser, id: 'new-user' });

      await service.createCustomerAccount({
        name: 'A',
        email: 'a@gmail.com',
        phone: '0901234567',
        cccd: '079203012345',
        passwordHash: null,
        emailVerified: true,
        socialAccount: {
          provider: 'google',
          providerUserId: 'g-1',
          email: 'a@gmail.com',
        },
      });

      const data = usersService.create.mock.calls[0][0];
      expect(data.passwordHash).toBeNull();
      expect(data.emailVerifiedAt).toBeInstanceOf(Date);
      expect(data.socialAccount).toEqual({
        provider: 'google',
        providerUserId: 'g-1',
        email: 'a@gmail.com',
      });
      expect(data.cccdMasked).toBe('********2345');
      expect(data.cccdHash).not.toContain('079203012345');
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('createCustomerAccount: trùng CCCD bị chặn y như đăng ký thường', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.findByCccdHash.mockResolvedValue({ ...baseUser });

      await expect(
        service.createCustomerAccount({
          name: 'A',
          email: 'a@gmail.com',
          phone: '0901234567',
          cccd: '079203012345',
          passwordHash: null,
          emailVerified: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('setPassword: tài khoản chưa có mật khẩu → lưu hash mới', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
      });
      usersService.update.mockImplementation((_id, data) => ({
        ...baseUser,
        ...data,
      }));

      await service.setPassword(baseUser.id, 'NewPass123');

      const { passwordHash } = usersService.update.mock.calls[0][1];
      expect(await bcrypt.compare('NewPass123', passwordHash)).toBe(true);
    });

    it('setPassword: đã có mật khẩu → chặn (phải dùng Đổi mật khẩu)', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        ...baseUser,
        passwordHash: 'hash',
      });

      await expect(
        service.setPassword(baseUser.id, 'NewPass123'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('changePassword: tài khoản chưa có mật khẩu → 400, không gọi bcrypt với null', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
      });

      await expect(
        service.changePassword(
          baseUser.id,
          { currentPassword: 'x', newPassword: 'NewPass123' },
          'access',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
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

  describe('changePassword', () => {
    it('ném UnauthorizedException nếu mật khẩu hiện tại không khớp', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 10);
      usersService.findByIdOrThrow.mockResolvedValue({
        ...baseUser,
        passwordHash,
      });

      await expect(
        service.changePassword(
          baseUser.id,
          { currentPassword: 'WrongPass1', newPassword: 'NewStr0ngPass1' },
          'some-access-token',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.update).not.toHaveBeenCalled();
      expect(usersService.updateRefreshTokenHash).not.toHaveBeenCalled();
    });

    it('đổi mật khẩu thành công khi mật khẩu hiện tại đúng — lưu hash MỚI (khác hash cũ)', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 10);
      usersService.findByIdOrThrow.mockResolvedValue({
        ...baseUser,
        passwordHash,
      });
      usersService.update.mockResolvedValue({ ...baseUser });
      jwtService.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 60,
      });

      await service.changePassword(
        baseUser.id,
        { currentPassword: 'CorrectPass1', newPassword: 'NewStr0ngPass1' },
        'some-access-token',
      );

      expect(usersService.update).toHaveBeenCalledWith(
        baseUser.id,
        { passwordHash: expect.any(String) },
        baseUser.id,
      );
      const savedHash = usersService.update.mock.calls[0][1].passwordHash;
      expect(savedHash).not.toBe(passwordHash);
      expect(await bcrypt.compare('NewStr0ngPass1', savedHash)).toBe(true);
    });

    it('thu hồi phiên đăng nhập hiện tại sau khi đổi mật khẩu (blacklist access token + xoá refreshTokenHash) — bắt đăng nhập lại', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass1', 10);
      usersService.findByIdOrThrow.mockResolvedValue({
        ...baseUser,
        passwordHash,
      });
      usersService.update.mockResolvedValue({ ...baseUser });
      const nowSeconds = Math.floor(Date.now() / 1000);
      jwtService.decode.mockReturnValue({ exp: nowSeconds + 120 });

      await service.changePassword(
        baseUser.id,
        { currentPassword: 'CorrectPass1', newPassword: 'NewStr0ngPass1' },
        'some-access-token',
      );

      expect(redisService.blacklistToken).toHaveBeenCalledWith(
        'some-access-token',
        expect.any(Number),
      );
      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        baseUser.id,
        null,
      );
    });
  });

  describe('forgotPassword', () => {
    it('không gửi email và không throw nếu email không tồn tại (tránh lộ email nào đã đăng ký)', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ email: 'ghost@example.com' }),
      ).resolves.toBeUndefined();

      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('gửi email chứa link reset kèm token khi email tồn tại', async () => {
      usersService.findByEmail.mockResolvedValue(baseUser);

      await service.forgotPassword({ email: baseUser.email });

      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        baseUser.email,
        baseUser.name,
        expect.stringContaining('password-reset-token'),
      );
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      redisService.isTokenBlacklisted.mockResolvedValue(false);
    });

    it('ném BadRequestException nếu token đã bị blacklist (đã dùng 1 lần trước đó — chống dùng lại)', async () => {
      redisService.isTokenBlacklisted.mockResolvedValue(true);

      await expect(
        service.resetPassword({
          token: 'already-used-token',
          newPassword: 'NewStr0ngPass1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu token sai chữ ký / hết hạn', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(
        service.resetPassword({
          token: 'bad-token',
          newPassword: 'NewStr0ngPass1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu token không có purpose "password-reset" (chống dùng nhầm access/email-verification token)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        purpose: 'email-verification',
      });

      await expect(
        service.resetPassword({
          token: 'some-token',
          newPassword: 'NewStr0ngPass1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(usersService.update).not.toHaveBeenCalled();
    });

    it('ném BadRequestException nếu user trong token không còn tồn tại', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'ghost-id',
        purpose: 'password-reset',
      });
      usersService.findById.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'some-token',
          newPassword: 'NewStr0ngPass1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('đổi mật khẩu thành công, thu hồi refresh token hiện có (bắt đăng nhập lại), và blacklist LUÔN chính token đã dùng (chống dùng lại trong thời gian còn hạn)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        purpose: 'password-reset',
      });
      jwtService.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      usersService.findById.mockResolvedValue(baseUser);
      usersService.update.mockResolvedValue({ ...baseUser });

      await service.resetPassword({
        token: 'valid-reset-token',
        newPassword: 'NewStr0ngPass1',
      });

      expect(usersService.update).toHaveBeenCalledWith(
        baseUser.id,
        { passwordHash: expect.any(String) },
        baseUser.id,
      );
      const savedHash = usersService.update.mock.calls[0][1].passwordHash;
      expect(await bcrypt.compare('NewStr0ngPass1', savedHash)).toBe(true);
      expect(usersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        baseUser.id,
        null,
      );
      expect(redisService.blacklistToken).toHaveBeenCalledWith(
        'valid-reset-token',
        expect.any(Number),
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

  describe('ảnh đại diện', () => {
    const PNG = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ]);
    const withOld = {
      ...baseUser,
      avatarPublicId: 'techrent/avatars/old',
      avatarUrl:
        'https://res.cloudinary.com/demo/image/upload/v1/techrent/avatars/old.jpg',
    };

    beforeEach(() => {
      usersService.findByIdOrThrow.mockResolvedValue(withOld);
      usersService.update.mockImplementation((_id, data) => ({
        ...withOld,
        ...data,
      }));
    });

    it('đổi ảnh: upload mới → lưu DB → RỒI mới xoá ảnh cũ', async () => {
      await service.updateAvatar(baseUser.id, {
        buffer: PNG,
        size: PNG.length,
      });

      expect(uploadService.uploadAvatar).toHaveBeenCalledWith(
        { buffer: PNG, mimetype: 'image/png' },
        expect.stringMatching(/^user-user-1-/),
      );
      expect(usersService.update).toHaveBeenCalledWith(
        baseUser.id,
        {
          avatarPublicId: 'techrent/avatars/new',
          avatarUrl: expect.stringContaining('avatars/new'),
        },
        baseUser.id,
      );
      expect(uploadService.deletePublicImage).toHaveBeenCalledWith(
        'techrent/avatars/old',
      );
      expect(usersService.update.mock.invocationCallOrder[0]).toBeLessThan(
        uploadService.deletePublicImage.mock.invocationCallOrder[0],
      );
    });

    it('lưu DB lỗi → xoá ảnh VỪA upload, giữ nguyên ảnh cũ', async () => {
      usersService.update.mockRejectedValue(new Error('db'));
      await expect(
        service.updateAvatar(baseUser.id, { buffer: PNG, size: PNG.length }),
      ).rejects.toThrow('db');
      expect(uploadService.deletePublicImage).toHaveBeenCalledWith(
        'techrent/avatars/new',
      );
      expect(uploadService.deletePublicImage).not.toHaveBeenCalledWith(
        'techrent/avatars/old',
      );
    });

    it('file không phải ảnh (theo nội dung) → 400, không upload', async () => {
      const fake = Buffer.from('%PDF-1.7');
      await expect(
        service.updateAvatar(baseUser.id, { buffer: fake, size: fake.length }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(uploadService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('vượt 5MB → 400, không upload', async () => {
      await expect(
        service.updateAvatar(baseUser.id, {
          buffer: PNG,
          size: 5 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow('vượt quá 5MB');
      expect(uploadService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('xoá ảnh: DB về null trước, rồi xoá trên Cloudinary', async () => {
      const result = await service.removeAvatar(baseUser.id);
      expect(usersService.update).toHaveBeenCalledWith(
        baseUser.id,
        { avatarPublicId: null, avatarUrl: null },
        baseUser.id,
      );
      expect(uploadService.deletePublicImage).toHaveBeenCalledWith(
        'techrent/avatars/old',
      );
      expect(result).toBeDefined();
    });

    it('lỗi xoá ảnh cũ trên Cloudinary không làm hỏng việc đổi ảnh', async () => {
      uploadService.deletePublicImage.mockRejectedValue(new Error('cdn'));
      await expect(
        service.updateAvatar(baseUser.id, { buffer: PNG, size: PNG.length }),
      ).resolves.toBeDefined();
    });
  });
});
