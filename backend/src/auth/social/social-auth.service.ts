import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, SocialProvider, User } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SafeUser, UsersService } from '../../users/users.service';
import {
  AuthService,
  AuthTokens,
  DUPLICATE_SOCIAL_MESSAGE,
} from '../auth.service';
import { SocialRegisterDto } from './social-register.dto';
import {
  SOCIAL_OAUTH_PROVIDERS,
  SocialOAuthProvider,
  SocialProfile,
  SocialProviderError,
} from './social-provider.interface';

/** Hạn của 3 loại khoá dùng 1 lần trên Redis. */
export const STATE_TTL_SECONDS = 10 * 60;
export const TICKET_TTL_SECONDS = 15 * 60;
export const EXCHANGE_CODE_TTL_SECONDS = 60;

const STATE_PREFIX = 'oauth:state:';
const TICKET_PREFIX = 'oauth:ticket:';
const CODE_PREFIX = 'oauth:code:';

/** Mã lỗi gửi về trang /auth/callback của frontend (không chứa chi tiết kỹ thuật). */
export type SocialCallbackError =
  | 'cancelled'
  | 'invalid_state'
  | 'provider_error'
  | 'provider_disabled'
  | 'already_linked'
  | 'link_conflict'
  | 'staff_must_link';

interface StateData {
  provider: SocialProvider;
  intent: 'login' | 'link';
  /** Chỉ có khi intent = link (người dùng đang đăng nhập bấm "Liên kết"). */
  userId?: string;
}

export interface TicketData {
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface SocialAccountsOverview {
  hasPassword: boolean;
  accounts: Array<{
    provider: SocialProvider;
    email: string | null;
    createdAt: Date;
  }>;
}

const TICKET_EXPIRED_MESSAGE =
  'Phiên đăng ký bằng mạng xã hội đã hết hạn hoặc đã được sử dụng — vui lòng bấm lại nút Google/Facebook';

/**
 * Đăng nhập/đăng ký bằng Google/Facebook. Nguyên tắc: provider CHỈ thay bước
 * nhập email + mật khẩu — chưa đăng ký đủ (SĐT, CCCD...) thì KHÔNG có user và
 * KHÔNG có token. Mọi khoá tạm (state chống CSRF, phiếu đăng ký, mã đổi token)
 * nằm trên Redis, có hạn và dùng 1 lần (GETDEL nguyên tử).
 */
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);
  private readonly providers: Map<SocialProvider, SocialOAuthProvider>;

  constructor(
    @Inject(SOCIAL_OAUTH_PROVIDERS) providers: SocialOAuthProvider[],
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.providers = new Map(providers.map((p) => [p.name, p]));
  }

  enabledProviders(): SocialProvider[] {
    return [...this.providers.values()]
      .filter((p) => p.isEnabled())
      .map((p) => p.name);
  }

  /** Tên provider từ URL → provider đang bật, ngược lại 404 (không lộ provider nào đang cấu hình dở). */
  resolveProvider(name: string): SocialOAuthProvider {
    const provider = this.providers.get(name as SocialProvider);
    if (!provider || !provider.isEnabled()) {
      throw new NotFoundException('Phương thức đăng nhập không khả dụng');
    }
    return provider;
  }

  async startLogin(providerName: string): Promise<string> {
    const provider = this.resolveProvider(providerName);
    const state = await this.createState({
      provider: provider.name,
      intent: 'login',
    });
    return provider.buildAuthorizationUrl(state);
  }

  async startLink(providerName: string, userId: string): Promise<string> {
    const provider = this.resolveProvider(providerName);
    const state = await this.createState({
      provider: provider.name,
      intent: 'link',
      userId,
    });
    return provider.buildAuthorizationUrl(state);
  }

  /**
   * Xử lý redirect từ Google/Facebook, trả về URL frontend để redirect tiếp.
   * KHÔNG bao giờ đặt access/refresh token vào URL — chỉ mã dùng 1 lần 60 s.
   */
  async handleCallback(
    providerName: string,
    query: { code?: string; state?: string; error?: string },
  ): Promise<string> {
    // State được tiêu thụ TRƯỚC mọi xử lý khác (kể cả khi người dùng bấm huỷ)
    // để không dùng lại được.
    const state = query.state ? await this.consumeState(query.state) : null;

    if (query.error) {
      return this.callbackError('cancelled');
    }
    if (!state || state.provider !== providerName || !query.code) {
      return this.callbackError('invalid_state');
    }

    let provider: SocialOAuthProvider;
    try {
      provider = this.resolveProvider(providerName);
    } catch {
      return this.callbackError('provider_disabled');
    }

    let profile: SocialProfile;
    try {
      profile = await provider.fetchProfile(query.code);
    } catch (error) {
      // Chỉ log mô tả + mã HTTP (SocialProviderError không chứa secret/token).
      this.logger.warn(
        `Đổi code ${providerName} thất bại: ${error instanceof SocialProviderError ? error.message : 'lỗi không xác định'}`,
      );
      return this.callbackError('provider_error');
    }

    if (state.intent === 'link' && state.userId) {
      return this.linkToUser(state.userId, provider.name, profile);
    }
    return this.loginOrStartRegistration(provider.name, profile);
  }

  private async loginOrStartRegistration(
    provider: SocialProvider,
    profile: SocialProfile,
  ): Promise<string> {
    // 1. Đã liên kết từ trước → đăng nhập thẳng.
    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
    });
    if (existing) {
      return this.callbackWithCode(existing.userId);
    }

    // 2. Email ĐÃ XÁC MINH trùng tài khoản đã đăng ký đầy đủ → liên kết + đăng nhập.
    //    Email chưa xác minh tuyệt đối không dùng để liên kết (chống chiếm tài khoản).
    //    CHỈ tự liên kết cho khách hàng: tài khoản staff/admin có quyền cao, lộ
    //    hộp thư Gmail không được đồng nghĩa với chiếm được quyền quản trị — họ
    //    phải đăng nhập bằng mật khẩu rồi tự liên kết trong /profile.
    if (profile.email && profile.emailVerified) {
      const user = await this.usersService.findByEmailInsensitive(
        profile.email,
      );
      if (user && user.role !== Role.customer) {
        return this.callbackError('staff_must_link');
      }
      if (user) {
        const linked = await this.createLink(user.id, provider, profile);
        if (!linked) return this.callbackError('link_conflict');
        return this.callbackWithCode(user.id);
      }
    }

    // 3. Chưa có tài khoản → KHÔNG tạo user, KHÔNG phát token: lưu danh tính tạm
    //    dưới 1 phiếu đăng ký, người dùng phải điền đủ SĐT/CCCD ở /register/social.
    const ticket = randomBytes(32).toString('base64url');
    const data: TicketData = {
      provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
    };
    await this.redis.client.set(
      TICKET_PREFIX + ticket,
      JSON.stringify(data),
      'EX',
      TICKET_TTL_SECONDS,
    );
    return `${this.frontendUrl()}/register/social?ticket=${ticket}`;
  }

  private async linkToUser(
    userId: string,
    provider: SocialProvider,
    profile: SocialProfile,
  ): Promise<string> {
    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
    });
    if (existing) {
      return existing.userId === userId
        ? this.callbackLinked(provider)
        : this.callbackError('already_linked');
    }
    const linked = await this.createLink(userId, provider, profile);
    return linked
      ? this.callbackLinked(provider)
      : this.callbackError('link_conflict');
  }

  /** `false` khi vi phạm unique (user đã gắn 1 tài khoản khác cùng provider, hoặc race). */
  private async createLink(
    userId: string,
    provider: SocialProvider,
    profile: SocialProfile,
  ): Promise<boolean> {
    try {
      await this.prisma.socialAccount.create({
        data: {
          userId,
          provider,
          providerUserId: profile.providerUserId,
          email: profile.email,
        },
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') return false;
      throw error;
    }
  }

  /** Thông tin điền sẵn cho form /register/social (KHÔNG tiêu thụ phiếu). */
  async getTicket(ticket: string): Promise<{
    provider: SocialProvider;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
  }> {
    const data = await this.readTicket(ticket);
    return {
      provider: data.provider,
      email: data.email,
      emailVerified: data.emailVerified,
      name: data.name,
    };
  }

  /**
   * Đăng ký đầy đủ bằng phiếu: dùng ĐÚNG `AuthService.createCustomerAccount()`
   * của đăng ký thường (trùng email/SĐT/CCCD, băm/mã hoá/che CCCD), tạo user +
   * social_account trong 1 transaction, huỷ phiếu, rồi MỚI phát token. Lỗi
   * validate → phiếu còn nguyên (còn hạn thì sửa lại được).
   */
  async register(
    dto: SocialRegisterDto,
  ): Promise<AuthTokens & { user: SafeUser }> {
    const ticket = await this.readTicket(dto.ticket);

    const email =
      ticket.emailVerified && ticket.email ? ticket.email : dto.email?.trim();
    if (!email) {
      throw new BadRequestException('Vui lòng nhập email');
    }

    const alreadyLinked = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: ticket.provider,
          providerUserId: ticket.providerUserId,
        },
      },
    });
    if (alreadyLinked) {
      await this.redis.client.del(TICKET_PREFIX + dto.ticket);
      throw new ConflictException(DUPLICATE_SOCIAL_MESSAGE);
    }

    const user: User = await this.authService.createCustomerAccount({
      name: dto.name,
      email,
      phone: dto.phone,
      cccd: dto.cccd,
      passwordHash: null,
      // Chỉ email provider đã xác minh mới bỏ qua bước xác thực email.
      emailVerified: ticket.emailVerified && email === ticket.email,
      socialAccount: {
        provider: ticket.provider,
        providerUserId: ticket.providerUserId,
        email: ticket.email,
      },
    });

    await this.redis.client.del(TICKET_PREFIX + dto.ticket);
    return this.authService.issueSession(user);
  }

  /** Đổi mã 1 lần (60 s) lấy access/refresh token — giống hệt đăng nhập thường. */
  async exchange(code: string): Promise<AuthTokens & { user: SafeUser }> {
    const userId = await this.redis.client.getdel(CODE_PREFIX + code);
    if (!userId) {
      throw new BadRequestException(
        'Mã đăng nhập không hợp lệ hoặc đã hết hạn — vui lòng đăng nhập lại',
      );
    }
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException(
        'Mã đăng nhập không hợp lệ hoặc đã hết hạn — vui lòng đăng nhập lại',
      );
    }
    return this.authService.issueSession(user);
  }

  async listAccounts(userId: string): Promise<SocialAccountsOverview> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const accounts = await this.prisma.socialAccount.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { provider: true, email: true, createdAt: true },
    });
    return { hasPassword: !!user.passwordHash, accounts };
  }

  /**
   * Gỡ liên kết — KHÔNG cho gỡ phương thức đăng nhập cuối cùng (không mật khẩu
   * và chỉ còn 1 liên kết). Khoá dòng user (FOR UPDATE) để 2 request gỡ song
   * song không cùng lọt qua kiểm tra.
   */
  async unlink(userId: string, providerName: string): Promise<void> {
    const provider = providerName as SocialProvider;
    if (!Object.values(SocialProvider).includes(provider)) {
      throw new NotFoundException('Không tìm thấy liên kết');
    }
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ password_hash: string | null }>>`
        SELECT password_hash FROM users WHERE id = ${userId} FOR UPDATE`;
      if (rows.length === 0) {
        throw new NotFoundException('Không tìm thấy người dùng');
      }
      const accounts = await tx.socialAccount.findMany({ where: { userId } });
      const target = accounts.find((a) => a.provider === provider);
      if (!target) {
        throw new NotFoundException('Không tìm thấy liên kết');
      }
      if (!rows[0].password_hash && accounts.length <= 1) {
        throw new BadRequestException(
          'Không thể gỡ phương thức đăng nhập cuối cùng — hãy đặt mật khẩu hoặc liên kết thêm tài khoản khác trước',
        );
      }
      await tx.socialAccount.delete({ where: { id: target.id } });
    });
  }

  private async readTicket(ticket: string): Promise<TicketData> {
    const raw = ticket
      ? await this.redis.client.get(TICKET_PREFIX + ticket)
      : null;
    if (!raw) {
      throw new GoneException(TICKET_EXPIRED_MESSAGE);
    }
    return JSON.parse(raw) as TicketData;
  }

  private async createState(data: StateData): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    await this.redis.client.set(
      STATE_PREFIX + state,
      JSON.stringify(data),
      'EX',
      STATE_TTL_SECONDS,
    );
    return state;
  }

  private async consumeState(state: string): Promise<StateData | null> {
    const raw = await this.redis.client.getdel(STATE_PREFIX + state);
    return raw ? (JSON.parse(raw) as StateData) : null;
  }

  private async callbackWithCode(userId: string): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.client.set(
      CODE_PREFIX + code,
      userId,
      'EX',
      EXCHANGE_CODE_TTL_SECONDS,
    );
    return `${this.frontendUrl()}/auth/callback?code=${code}`;
  }

  private callbackLinked(provider: SocialProvider): string {
    return `${this.frontendUrl()}/auth/callback?linked=${provider}`;
  }

  private callbackError(error: SocialCallbackError): string {
    return `${this.frontendUrl()}/auth/callback?error=${error}`;
  }

  private frontendUrl(): string {
    return this.config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
  }
}
