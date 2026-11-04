import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decryptCccd } from '../common/crypto/cccd-crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role, SocialProvider, User } from '../generated/prisma/client';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  /** Bản che bớt (VD "********1234"), `null` nếu chưa bổ sung CCCD — KHÔNG BAO GIỜ trả CCCD đầy đủ ở đây. */
  cccdMasked: string | null;
  /**
   * `true` khi ĐỦ CẢ 3 ảnh KYC (CCCD mặt trước/sau + ảnh chân dung). Chỉ trả
   * boolean đã tính sẵn — KHÔNG BAO GIỜ trả `public_id`/URL ảnh ở response
   * thông thường này (xem `UsersController.getKycImages`, admin-only).
   */
  kycVerified: boolean;
  emailVerifiedAt: Date | null;
  /** `false` = tài khoản đăng ký bằng Google/Facebook chưa đặt mật khẩu. */
  hasPassword: boolean;
  /** Ảnh đại diện CÔNG KHAI (Cloudinary techrent/avatars), `null` = hiện chữ viết tắt. */
  avatarUrl: string | null;
  createdAt: Date;
  isBlacklisted: boolean;
  blacklistReason: string | null;
  blacklistedAt: Date | null;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Kiểm tra trùng CCCD qua hash — KHÔNG cần giải mã, dùng cho pre-check trước khi tạo/bổ sung CCCD. */
  findByCccdHash(cccdHash: string) {
    return this.prisma.user.findUnique({ where: { cccdHash } });
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return user;
  }

  /** Tìm theo email không phân biệt hoa/thường — dùng khi liên kết theo email Google/Facebook trả về. */
  findByEmailInsensitive(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  /**
   * `socialAccount` (đăng ký bằng Google/Facebook) tạo bằng nested create —
   * Prisma chạy user + social_account trong CÙNG 1 transaction.
   */
  create(data: {
    name: string;
    email: string;
    passwordHash: string | null;
    phone?: string;
    cccdHash?: string;
    cccdEncrypted?: string;
    cccdMasked?: string;
    role?: Role;
    emailVerifiedAt?: Date;
    socialAccount?: {
      provider: SocialProvider;
      providerUserId: string;
      email: string | null;
    };
  }) {
    const { socialAccount, ...userData } = data;
    return this.prisma.user.create({
      data: socialAccount
        ? { ...userData, socialAccounts: { create: socialAccount } }
        : userData,
    });
  }

  async findAll(
    page: number,
    limit: number,
    role?: Role,
    search?: string,
    isBlacklisted?: boolean,
  ): Promise<PaginatedResult<SafeUser>> {
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(isBlacklisted !== undefined ? { isBlacklisted } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * limit;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((user) => this.sanitize(user)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * `currentUserId` là id của người GỌI request (từ `@CurrentUser()`, luôn có
   * giá trị vì route này bắt buộc đăng nhập) — dùng để chặn tự đổi role của
   * chính mình. Áp dụng cho MỌI role gọi (kể cả admin), không có ngoại lệ —
   * đây là quy tắc chung "không ai được tự thao túng quyền của chính tài
   * khoản mình", KHÔNG phải chặn riêng cho 1 role cụ thể.
   */
  async update(
    id: string,
    data: {
      name?: string;
      phone?: string;
      role?: Role;
      passwordHash?: string;
      cccdHash?: string;
      cccdEncrypted?: string;
      cccdMasked?: string;
      kycCccdFrontPublicId?: string;
      kycCccdBackPublicId?: string;
      kycSelfiePublicId?: string;
      avatarPublicId?: string | null;
      avatarUrl?: string | null;
    },
    currentUserId: string,
  ): Promise<User> {
    const existing = await this.findByIdOrThrow(id);
    if (
      id === currentUserId &&
      data.role !== undefined &&
      data.role !== existing.role
    ) {
      throw new ForbiddenException('Không thể tự đổi vai trò của chính mình');
    }
    return this.prisma.user.update({ where: { id }, data });
  }

  /**
   * Chặn tự xoá chính tài khoản đang gọi request — xem ghi chú ở `update()`.
   * Chặn THÊM xoá user đã blacklist (mục 7 Roadmap, mở rộng 22/10 buổi 6) —
   * đây chính là cơ chế "chặn theo CCCD, không chỉ theo tài khoản": giữ
   * nguyên hàng user đã blacklist nghĩa là `cccdHash` unique của họ VẪN bị
   * chiếm giữ vĩnh viễn, nên `AuthService.register()` (đã có sẵn check trùng
   * cccdHash) tự động từ chối CCCD đó đăng ký tài khoản mới — KHÔNG cần thêm
   * bảng/cơ chế tra cứu CCCD riêng, tái dùng đúng unique constraint sẵn có.
   */
  async remove(id: string, currentUserId: string): Promise<void> {
    if (id === currentUserId) {
      throw new ForbiddenException('Không thể tự xoá tài khoản của chính mình');
    }
    const existing = await this.findByIdOrThrow(id);
    if (existing.isBlacklisted) {
      throw new ForbiddenException(
        'Không thể xoá người dùng đã bị đưa vào danh sách đen — cần giữ lại để chặn CCCD này đăng ký tài khoản mới',
      );
    }
    await this.prisma.user.delete({ where: { id } });
  }

  /**
   * Admin đưa 1 user vào/ra khỏi danh sách đen. Bắt buộc `reason` khi
   * `blacklisted=true` (dùng làm bằng chứng khi trình báo công an/khởi kiện —
   * xem `/admin/blacklist`), tự xoá `reason`/`blacklistedAt` khi gỡ blacklist.
   * Chặn tự blacklist chính mình — cùng nguyên tắc "không ai được tự thao
   * túng quyền/tồn tại của chính tài khoản mình" đã áp dụng cho `update()`/`remove()`.
   */
  async setBlacklistStatus(
    id: string,
    blacklisted: boolean,
    reason: string | undefined,
    currentUserId: string,
  ): Promise<User> {
    if (id === currentUserId) {
      throw new ForbiddenException(
        'Không thể tự đưa chính tài khoản của mình vào danh sách đen',
      );
    }
    await this.findByIdOrThrow(id);
    if (blacklisted && !reason?.trim()) {
      throw new BadRequestException(
        'Vui lòng nhập lý do khi đưa người dùng vào danh sách đen',
      );
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        isBlacklisted: blacklisted,
        blacklistReason: blacklisted ? reason!.trim() : null,
        blacklistedAt: blacklisted ? new Date() : null,
      },
    });
  }

  updateRefreshTokenHash(userId: string, refreshTokenHash: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });
  }

  markEmailVerified(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  /**
   * Giải mã CCCD đầy đủ — CHỈ gọi từ `GET /users/:id/cccd` (admin xem để xác
   * minh tranh chấp thật). `encryptionKey` truyền vào từ `ConfigService` ở
   * controller, KHÔNG đọc `process.env` trực tiếp trong service (nhất quán
   * pattern dùng ConfigService xuyên suốt dự án).
   */
  async revealCccd(id: string, encryptionKey: string): Promise<string> {
    const user = await this.findByIdOrThrow(id);
    if (!user.cccdEncrypted) {
      throw new NotFoundException('Người dùng này chưa có CCCD trong hồ sơ');
    }
    return decryptCccd(user.cccdEncrypted, encryptionKey);
  }

  /**
   * Admin RESET hồ sơ KYC (ảnh mờ/sai/hết hạn...) — xoá cả 3 `public_id` khỏi
   * DB để khách nộp lại được (giống `addCccd()`, mặc định KHÔNG cho tự nộp
   * lại nếu đã đủ cả 3 ảnh — CHỈ admin mới gỡ được). Trả về user TRƯỚC khi
   * xoá (để caller — `UsersController` — biết public_id cũ mà xoá luôn trên
   * Cloudinary, tránh ảnh nhạy cảm nằm lại vô thời hạn trên storage).
   */
  async resetKycImages(id: string): Promise<User> {
    const existing = await this.findByIdOrThrow(id);
    await this.prisma.user.update({
      where: { id },
      data: {
        kycCccdFrontPublicId: null,
        kycCccdBackPublicId: null,
        kycSelfiePublicId: null,
      },
    });
    return existing;
  }

  sanitize(user: User): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      cccdMasked: user.cccdMasked,
      kycVerified: !!(
        user.kycCccdFrontPublicId &&
        user.kycCccdBackPublicId &&
        user.kycSelfiePublicId
      ),
      emailVerifiedAt: user.emailVerifiedAt,
      hasPassword: !!user.passwordHash,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      isBlacklisted: user.isBlacklisted,
      blacklistReason: user.blacklistReason,
      blacklistedAt: user.blacklistedAt,
    };
  }
}
