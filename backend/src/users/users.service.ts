import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { decryptCccd } from '../common/crypto/cccd-crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role, User } from '../generated/prisma/client';

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  /** Bản che bớt (VD "********1234"), `null` nếu chưa bổ sung CCCD — KHÔNG BAO GIỜ trả CCCD đầy đủ ở đây. */
  cccdMasked: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
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

  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    phone?: string;
    cccdHash?: string;
    cccdEncrypted?: string;
    cccdMasked?: string;
    role?: Role;
  }) {
    return this.prisma.user.create({ data });
  }

  async findAll(
    page: number,
    limit: number,
    role?: Role,
    search?: string,
  ): Promise<PaginatedResult<SafeUser>> {
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
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

  /** Chặn tự xoá chính tài khoản đang gọi request — xem ghi chú ở `update()`. */
  async remove(id: string, currentUserId: string): Promise<void> {
    if (id === currentUserId) {
      throw new ForbiddenException('Không thể tự xoá tài khoản của chính mình');
    }
    await this.findByIdOrThrow(id);
    await this.prisma.user.delete({ where: { id } });
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

  sanitize(user: User): SafeUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      cccdMasked: user.cccdMasked,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
    };
  }
}
