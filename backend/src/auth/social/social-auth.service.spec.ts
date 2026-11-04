import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import {
  EXCHANGE_CODE_TTL_SECONDS,
  STATE_TTL_SECONDS,
  SocialAuthService,
  TICKET_TTL_SECONDS,
} from './social-auth.service';
import {
  SocialOAuthProvider,
  SocialProfile,
  SocialProviderError,
} from './social-provider.interface';

/** Redis giả trong bộ nhớ, tôn trọng TTL theo đồng hồ `now` điều khiển được. */
class FakeRedis {
  now = 0;
  store = new Map<string, { value: string; expiresAt: number }>();

  set(key: string, value: string, _ex: 'EX', ttl: number) {
    this.store.set(key, { value, expiresAt: this.now + ttl * 1000 });
    return Promise.resolve('OK');
  }
  get(key: string) {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= this.now) return Promise.resolve(null);
    return Promise.resolve(entry.value);
  }
  async getdel(key: string) {
    const value = await this.get(key);
    this.store.delete(key);
    return value;
  }
  del(key: string) {
    this.store.delete(key);
    return Promise.resolve(1);
  }
  ttlOf(prefix: string) {
    const entry = [...this.store.entries()].find(([k]) => k.startsWith(prefix));
    return entry ? (entry[1].expiresAt - this.now) / 1000 : null;
  }
}

const FRONTEND = 'http://localhost:3000';

function param(url: string, name: string) {
  return new URL(url).searchParams.get(name);
}

describe('SocialAuthService', () => {
  let service: SocialAuthService;
  let redis: FakeRedis;
  let google: jest.Mocked<SocialOAuthProvider>;
  let facebook: jest.Mocked<SocialOAuthProvider>;
  let authService: {
    createCustomerAccount: jest.Mock;
    issueSession: jest.Mock;
    setAvatarFromRemote: jest.Mock;
  };
  let usersService: {
    findByEmailInsensitive: jest.Mock;
    findById: jest.Mock;
    findByIdOrThrow: jest.Mock;
  };
  let socialAccounts: Array<{
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    email: string | null;
    createdAt: Date;
  }>;
  let userPasswordHash: string | null;
  let prisma: any;

  const googleProfile: SocialProfile = {
    providerUserId: 'g-123',
    email: 'khach@gmail.com',
    emailVerified: true,
    name: 'Khách Google',
  };

  function makeProvider(name: 'google' | 'facebook') {
    return {
      name,
      isEnabled: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest.fn(
        (state: string) => `https://${name}.test/auth?state=${state}`,
      ),
      fetchProfile: jest.fn(),
    } as unknown as jest.Mocked<SocialOAuthProvider>;
  }

  beforeEach(() => {
    redis = new FakeRedis();
    google = makeProvider('google');
    facebook = makeProvider('facebook');
    google.fetchProfile.mockResolvedValue(googleProfile);
    authService = {
      createCustomerAccount: jest.fn(async (input) => ({
        id: 'new-user',
        email: input.email,
      })),
      setAvatarFromRemote: jest.fn(async (id: string) => ({
        id,
        avatarUrl:
          'https://res.cloudinary.com/demo/image/upload/v1/techrent/avatars/x.jpg',
      })),
      issueSession: jest.fn(async (user) => ({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: user.id },
      })),
    };
    usersService = {
      findByEmailInsensitive: jest.fn().mockResolvedValue(null),
      findById: jest.fn(async (id: string) => ({ id })),
      findByIdOrThrow: jest.fn(async (id: string) => ({
        id,
        passwordHash: userPasswordHash,
      })),
    };
    socialAccounts = [];
    userPasswordHash = null;

    const socialAccount = {
      findUnique: jest.fn(async ({ where }) => {
        const k = where.provider_providerUserId;
        return (
          socialAccounts.find(
            (a) =>
              a.provider === k.provider &&
              a.providerUserId === k.providerUserId,
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }) => {
        const dup = socialAccounts.some(
          (a) =>
            (a.provider === data.provider &&
              a.providerUserId === data.providerUserId) ||
            (a.userId === data.userId && a.provider === data.provider),
        );
        if (dup) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = {
          id: `sa-${socialAccounts.length + 1}`,
          createdAt: new Date(),
          ...data,
        };
        socialAccounts.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }) =>
        socialAccounts.filter((a) => a.userId === where.userId),
      ),
      delete: jest.fn(async ({ where }) => {
        socialAccounts = socialAccounts.filter((a) => a.id !== where.id);
      }),
    };
    prisma = {
      socialAccount,
      $transaction: jest.fn(async (cb) =>
        cb({
          socialAccount,
          $queryRaw: jest.fn(async () => [{ password_hash: userPasswordHash }]),
        }),
      ),
    };

    service = new SocialAuthService(
      [google, facebook],
      authService as any,
      usersService as any,
      prisma,
      { client: redis } as any,
      { get: () => FRONTEND } as any,
    );
  });

  async function stateFromStart(provider = 'google') {
    const url = await service.startLogin(provider);
    return param(url, 'state')!;
  }

  describe('bật/tắt provider', () => {
    it('chỉ liệt kê provider đủ biến môi trường', () => {
      facebook.isEnabled.mockReturnValue(false);
      expect(service.enabledProviders()).toEqual(['google']);
    });

    it('provider tắt hoặc không tồn tại → 404 khi bắt đầu', async () => {
      facebook.isEnabled.mockReturnValue(false);
      await expect(service.startLogin('facebook')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.startLogin('zalo')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('state chống CSRF', () => {
    it('lưu state trên Redis với hạn 10 phút', async () => {
      await stateFromStart();
      expect(redis.ttlOf('oauth:state:')).toBe(STATE_TTL_SECONDS);
    });

    it('state sai → invalid_state, không gọi provider', async () => {
      await stateFromStart();
      const url = await service.handleCallback('google', {
        code: 'c',
        state: 'gia-mao',
      });
      expect(url).toBe(`${FRONTEND}/auth/callback?error=invalid_state`);
      expect(google.fetchProfile).not.toHaveBeenCalled();
    });

    it('thiếu state → invalid_state', async () => {
      const url = await service.handleCallback('google', { code: 'c' });
      expect(param(url, 'error')).toBe('invalid_state');
    });

    it('state hết hạn → invalid_state', async () => {
      const state = await stateFromStart();
      redis.now += (STATE_TTL_SECONDS + 1) * 1000;
      const url = await service.handleCallback('google', { code: 'c', state });
      expect(param(url, 'error')).toBe('invalid_state');
    });

    it('state chỉ dùng được 1 lần', async () => {
      socialAccounts.push({
        id: 'sa-0',
        userId: 'u-1',
        provider: 'google',
        providerUserId: 'g-123',
        email: null,
        createdAt: new Date(),
      });
      const state = await stateFromStart();
      const first = await service.handleCallback('google', {
        code: 'c',
        state,
      });
      expect(param(first, 'code')).toBeTruthy();
      const second = await service.handleCallback('google', {
        code: 'c',
        state,
      });
      expect(param(second, 'error')).toBe('invalid_state');
    });

    it('state của Google dùng cho callback Facebook → invalid_state', async () => {
      const state = await stateFromStart('google');
      const url = await service.handleCallback('facebook', {
        code: 'c',
        state,
      });
      expect(param(url, 'error')).toBe('invalid_state');
    });

    it('người dùng bấm huỷ → cancelled, state bị tiêu thụ', async () => {
      const state = await stateFromStart();
      const url = await service.handleCallback('google', {
        error: 'access_denied',
        state,
      });
      expect(param(url, 'error')).toBe('cancelled');
      expect(redis.store.size).toBe(0);
    });

    it('provider lỗi khi đổi code → provider_error', async () => {
      google.fetchProfile.mockRejectedValue(
        new SocialProviderError('Google token: HTTP 400'),
      );
      const state = await stateFromStart();
      const url = await service.handleCallback('google', { code: 'c', state });
      expect(param(url, 'error')).toBe('provider_error');
    });
  });

  describe('lần đầu bấm "Tiếp tục với Google/Facebook"', () => {
    it('chưa có tài khoản → KHÔNG tạo user, KHÔNG phát token, chỉ có phiếu đăng ký 15 phút', async () => {
      const state = await stateFromStart();
      const url = await service.handleCallback('google', { code: 'c', state });

      expect(url.startsWith(`${FRONTEND}/register/social?ticket=`)).toBe(true);
      expect(authService.createCustomerAccount).not.toHaveBeenCalled();
      expect(authService.issueSession).not.toHaveBeenCalled();
      expect(prisma.socialAccount.create).not.toHaveBeenCalled();
      expect(redis.ttlOf('oauth:ticket:')).toBe(TICKET_TTL_SECONDS);
    });

    it('email ĐÃ xác minh trùng tài khoản có sẵn → liên kết và đăng nhập', async () => {
      usersService.findByEmailInsensitive.mockResolvedValue({
        id: 'u-old',
        role: 'customer',
      });
      const state = await stateFromStart();
      const url = await service.handleCallback('google', { code: 'c', state });

      expect(param(url, 'code')).toBeTruthy();
      expect(socialAccounts).toEqual([
        expect.objectContaining({ userId: 'u-old', providerUserId: 'g-123' }),
      ]);
    });

    it.each(['admin', 'staff'])(
      'email đã xác minh trùng tài khoản %s → KHÔNG liên kết, KHÔNG đăng nhập (staff_must_link)',
      async (role) => {
        usersService.findByEmailInsensitive.mockResolvedValue({
          id: 'u-admin',
          role,
        });
        const state = await stateFromStart();
        const url = await service.handleCallback('google', {
          code: 'c',
          state,
        });

        expect(param(url, 'error')).toBe('staff_must_link');
        expect(param(url, 'code')).toBeNull();
        expect(socialAccounts).toHaveLength(0);
        expect(redis.ttlOf('oauth:code:')).toBeNull();
        expect(redis.ttlOf('oauth:ticket:')).toBeNull();
      },
    );

    it('admin chủ động liên kết Google trong /profile (đã đăng nhập bằng mật khẩu) → vẫn được', async () => {
      const state = param(
        await service.startLink('google', 'u-admin'),
        'state',
      )!;
      const cb = await service.handleCallback('google', { code: 'c', state });
      expect(param(cb, 'linked')).toBe('google');
      expect(socialAccounts[0]).toMatchObject({ userId: 'u-admin' });
    });

    it('email CHƯA xác minh trùng tài khoản có sẵn → KHÔNG liên kết, chuyển sang đăng ký', async () => {
      google.fetchProfile.mockResolvedValue({
        ...googleProfile,
        emailVerified: false,
      });
      usersService.findByEmailInsensitive.mockResolvedValue({ id: 'u-old' });
      const state = await stateFromStart();
      const url = await service.handleCallback('google', { code: 'c', state });

      expect(url).toContain('/register/social?ticket=');
      expect(usersService.findByEmailInsensitive).not.toHaveBeenCalled();
      expect(socialAccounts).toHaveLength(0);
    });

    it('tài khoản có sẵn đã gắn 1 Google khác → link_conflict, không đăng nhập', async () => {
      socialAccounts.push({
        id: 'sa-0',
        userId: 'u-old',
        provider: 'google',
        providerUserId: 'g-khac',
        email: null,
        createdAt: new Date(),
      });
      usersService.findByEmailInsensitive.mockResolvedValue({
        id: 'u-old',
        role: 'customer',
      });
      const state = await stateFromStart();
      const url = await service.handleCallback('google', { code: 'c', state });
      expect(param(url, 'error')).toBe('link_conflict');
    });
  });

  describe('lần sau + mã đổi token', () => {
    beforeEach(() => {
      socialAccounts.push({
        id: 'sa-0',
        userId: 'u-1',
        provider: 'google',
        providerUserId: 'g-123',
        email: null,
        createdAt: new Date(),
      });
    });

    it('đã liên kết → đăng nhập thẳng; URL chỉ có mã 1 lần, không có token', async () => {
      const state = await stateFromStart();
      const url = await service.handleCallback('google', { code: 'c', state });

      expect(url).not.toContain('access');
      expect(redis.ttlOf('oauth:code:')).toBe(EXCHANGE_CODE_TTL_SECONDS);
      const result = await service.exchange(param(url, 'code')!);
      expect(result.accessToken).toBe('access');
      expect(authService.issueSession).toHaveBeenCalledWith({ id: 'u-1' });
    });

    it('mã đổi token chỉ dùng được 1 lần', async () => {
      const state = await stateFromStart();
      const code = param(
        await service.handleCallback('google', { code: 'c', state }),
        'code',
      )!;
      await service.exchange(code);
      await expect(service.exchange(code)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('mã đổi token hết hạn sau 60 giây', async () => {
      const state = await stateFromStart();
      const code = param(
        await service.handleCallback('google', { code: 'c', state }),
        'code',
      )!;
      redis.now += (EXCHANGE_CODE_TTL_SECONDS + 1) * 1000;
      await expect(service.exchange(code)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('đăng ký đầy đủ bằng phiếu', () => {
    async function ticketFor(profile: SocialProfile, provider = google) {
      provider.fetchProfile.mockResolvedValue(profile);
      const state = await stateFromStart(provider.name);
      const url = await service.handleCallback(provider.name, {
        code: 'c',
        state,
      });
      return param(url, 'ticket')!;
    }

    const form = {
      name: 'Nguyễn Văn A',
      phone: '0901234567',
      cccd: '079203012345',
      acceptTerms: true,
    };

    it('thành công → tạo user + liên kết qua hàm đăng ký chung, huỷ phiếu, RỒI mới phát token', async () => {
      const ticket = await ticketFor(googleProfile);
      const result = await service.register({
        ...form,
        ticket,
        email: 'khac@x.com',
      });

      expect(authService.createCustomerAccount).toHaveBeenCalledWith({
        name: form.name,
        email: 'khach@gmail.com', // email đã xác minh — bỏ qua email client gửi
        phone: form.phone,
        cccd: form.cccd,
        passwordHash: null,
        emailVerified: true,
        socialAccount: {
          provider: 'google',
          providerUserId: 'g-123',
          email: 'khach@gmail.com',
        },
      });
      const createOrder =
        authService.createCustomerAccount.mock.invocationCallOrder[0];
      const sessionOrder = authService.issueSession.mock.invocationCallOrder[0];
      expect(createOrder).toBeLessThan(sessionOrder);
      expect(result.accessToken).toBe('access');
      expect(redis.ttlOf('oauth:ticket:')).toBeNull();
    });

    it('có ảnh Google → chép sang Cloudinary (setAvatarFromRemote) SAU khi tạo user, token phát kèm avatar mới', async () => {
      const ticket = await ticketFor({
        ...googleProfile,
        avatarUrl: 'https://lh3.googleusercontent.com/a/abc=s256-c',
      });
      await service.register({ ...form, ticket });

      expect(authService.setAvatarFromRemote).toHaveBeenCalledWith(
        'new-user',
        'https://lh3.googleusercontent.com/a/abc=s256-c',
      );
      expect(authService.issueSession).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarUrl: expect.stringContaining('techrent/avatars'),
        }),
      );
    });

    it('chép ảnh lỗi → vẫn đăng ký xong (không có avatar)', async () => {
      authService.setAvatarFromRemote.mockRejectedValue(new Error('cdn'));
      const ticket = await ticketFor({
        ...googleProfile,
        avatarUrl: 'https://lh3.googleusercontent.com/a/abc',
      });
      await expect(
        service.register({ ...form, ticket }),
      ).resolves.toMatchObject({
        accessToken: 'access',
      });
    });

    it('không có ảnh hoặc link không phải https → không chép', async () => {
      const ticket = await ticketFor({
        ...googleProfile,
        avatarUrl: 'http://insecure.example.com/a.jpg',
      });
      await service.register({ ...form, ticket });
      expect(authService.setAvatarFromRemote).not.toHaveBeenCalled();
    });

    it('phiếu đã dùng → 410, không tạo thêm user', async () => {
      const ticket = await ticketFor(googleProfile);
      await service.register({ ...form, ticket });
      await expect(
        service.register({ ...form, ticket }),
      ).rejects.toBeInstanceOf(GoneException);
      expect(authService.createCustomerAccount).toHaveBeenCalledTimes(1);
    });

    it('phiếu hết hạn (bỏ ngang quá 15 phút) → 410, không có user nào được tạo', async () => {
      const ticket = await ticketFor(googleProfile);
      redis.now += (TICKET_TTL_SECONDS + 1) * 1000;
      await expect(service.getTicket(ticket)).rejects.toBeInstanceOf(
        GoneException,
      );
      await expect(
        service.register({ ...form, ticket }),
      ).rejects.toBeInstanceOf(GoneException);
      expect(authService.createCustomerAccount).not.toHaveBeenCalled();
    });

    it.each([
      ['email', 'Email đã được sử dụng'],
      ['SĐT', 'Số điện thoại này đã được đăng ký bởi một tài khoản khác'],
      ['CCCD', 'Số CCCD này đã được đăng ký bởi một tài khoản khác'],
    ])(
      'trùng %s → lỗi rõ ràng, KHÔNG phát token, phiếu còn để sửa lại',
      async (_label, message) => {
        const ticket = await ticketFor(googleProfile);
        authService.createCustomerAccount.mockRejectedValueOnce(
          new ConflictException(message),
        );

        await expect(service.register({ ...form, ticket })).rejects.toThrow(
          message,
        );
        expect(authService.issueSession).not.toHaveBeenCalled();
        await expect(service.getTicket(ticket)).resolves.toMatchObject({
          provider: 'google',
        });
        // Sửa lại rồi gửi lần 2 thành công.
        await expect(
          service.register({ ...form, ticket }),
        ).resolves.toMatchObject({ accessToken: 'access' });
      },
    );

    it('Facebook không trả email → bắt nhập email, email tự nhập phải xác thực lại', async () => {
      const ticket = await ticketFor(
        {
          providerUserId: 'fb-1',
          email: null,
          emailVerified: false,
          name: 'B',
        },
        facebook,
      );
      await expect(
        service.register({ ...form, ticket }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await service.register({ ...form, ticket, email: 'b@x.com' });
      expect(authService.createCustomerAccount).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'b@x.com', emailVerified: false }),
      );
    });

    it('danh tính đã được đăng ký bởi request khác (race) → 409, phiếu bị huỷ', async () => {
      const ticket = await ticketFor(googleProfile);
      socialAccounts.push({
        id: 'sa-9',
        userId: 'u-9',
        provider: 'google',
        providerUserId: 'g-123',
        email: null,
        createdAt: new Date(),
      });
      await expect(
        service.register({ ...form, ticket }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(authService.issueSession).not.toHaveBeenCalled();
    });
  });

  describe('liên kết / gỡ liên kết', () => {
    it('liên kết tài khoản Google đã thuộc user khác → already_linked', async () => {
      socialAccounts.push({
        id: 'sa-0',
        userId: 'u-khac',
        provider: 'google',
        providerUserId: 'g-123',
        email: null,
        createdAt: new Date(),
      });
      const url = await service.startLink('google', 'u-1');
      const state = param(url, 'state')!;
      const cb = await service.handleCallback('google', { code: 'c', state });
      expect(param(cb, 'error')).toBe('already_linked');
    });

    it('liên kết thành công → linked, không phát mã đăng nhập', async () => {
      const state = param(await service.startLink('google', 'u-1'), 'state')!;
      const cb = await service.handleCallback('google', { code: 'c', state });
      expect(param(cb, 'linked')).toBe('google');
      expect(param(cb, 'code')).toBeNull();
      expect(socialAccounts[0]).toMatchObject({ userId: 'u-1' });
    });

    it('KHÔNG gỡ được phương thức đăng nhập cuối cùng (không mật khẩu, 1 liên kết)', async () => {
      socialAccounts.push({
        id: 'sa-0',
        userId: 'u-1',
        provider: 'google',
        providerUserId: 'g-123',
        email: null,
        createdAt: new Date(),
      });
      await expect(service.unlink('u-1', 'google')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(socialAccounts).toHaveLength(1);
    });

    it('có mật khẩu → gỡ được liên kết duy nhất', async () => {
      userPasswordHash = 'hash';
      socialAccounts.push({
        id: 'sa-0',
        userId: 'u-1',
        provider: 'google',
        providerUserId: 'g-123',
        email: null,
        createdAt: new Date(),
      });
      await service.unlink('u-1', 'google');
      expect(socialAccounts).toHaveLength(0);
    });

    it('không mật khẩu nhưng còn Facebook → gỡ được Google', async () => {
      socialAccounts.push(
        {
          id: 'sa-0',
          userId: 'u-1',
          provider: 'google',
          providerUserId: 'g-123',
          email: null,
          createdAt: new Date(),
        },
        {
          id: 'sa-1',
          userId: 'u-1',
          provider: 'facebook',
          providerUserId: 'fb-1',
          email: null,
          createdAt: new Date(),
        },
      );
      await service.unlink('u-1', 'google');
      expect(socialAccounts.map((a) => a.provider)).toEqual(['facebook']);
    });

    it('listAccounts trả hasPassword + danh sách liên kết', async () => {
      userPasswordHash = null;
      await expect(service.listAccounts('u-1')).resolves.toEqual({
        hasPassword: false,
        accounts: [],
      });
    });
  });
});
