import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { translateUniqueConstraintError } from '../common/prisma-error.util';
import { Role } from '../generated/prisma/client';
import { UploadService } from '../upload/upload.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SetUserBlacklistDto } from './dto/set-user-blacklist.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const PASSWORD_SALT_ROUNDS = 10;
const DUPLICATE_PHONE_MESSAGE =
  'Số điện thoại này đã được đăng ký bởi một tài khoản khác';

// Hạn xem ảnh KYC — ngắn hơn hẳn thời gian sống access token (15 phút) vì
// đây là dữ liệu nhạy cảm hơn hẳn (giấy tờ tuỳ thân + sinh trắc học khuôn
// mặt), đã verify THẬT Cloudinary enforce hạn này (xem UploadService).
const KYC_IMAGE_VIEW_TTL_SECONDS = 300;

const KYC_IMAGE_SLOTS = [
  {
    slot: 'cccd-front',
    label: 'CCCD mặt trước',
    field: 'kycCccdFrontPublicId' as const,
  },
  {
    slot: 'cccd-back',
    label: 'CCCD mặt sau',
    field: 'kycCccdBackPublicId' as const,
  },
  {
    slot: 'selfie',
    label: 'Ảnh chân dung xác thực',
    field: 'kycSelfiePublicId' as const,
  },
];

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.admin)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly uploadService: UploadService,
  ) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    try {
      const user = await this.usersService.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
        phone: dto.phone,
        role: dto.role ?? Role.customer,
      });
      return this.usersService.sanitize(user);
    } catch (error) {
      throw translateUniqueConstraintError(error, {
        phone: DUPLICATE_PHONE_MESSAGE,
      });
    }
  }

  @Get()
  findAll(@Query() query: ListUsersQueryDto) {
    return this.usersService.findAll({
      ...query,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findByIdOrThrow(id);
    return this.usersService.sanitize(user);
  }

  /**
   * Class ở trên khoá `@Roles(Role.admin)` cho MỌI route — riêng route này
   * mở lại cho mọi role đã đăng nhập (method-level `@Roles` override class-level,
   * xem `RolesGuard.getAllAndOverride`) để khách hàng tự sửa HỒ SƠ CHÍNH MÌNH
   * (trang `/profile`) qua thẳng API này, KHÔNG cần thêm endpoint riêng.
   *
   * Không phải admin thì bị giới hạn chặt: chỉ được sửa ĐÚNG bản ghi của
   * chính mình, và TUYỆT ĐỐI không được kèm `role` (tự nâng/hạ quyền) hay
   * `password` (đổi mật khẩu không cần biết mật khẩu cũ — đúng lỗ hổng đã
   * vá cho admin tự-sửa-mình, ở đây phòng thủ luôn cho customer/staff, đổi
   * mật khẩu phải đi qua `POST /auth/change-password` có verify mật khẩu cũ).
   * Kiểm tra ở TẦNG BACKEND (không tin frontend không gửi field đó lên).
   */
  @Roles(Role.customer, Role.staff, Role.admin)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    if (currentUser.role !== Role.admin) {
      if (id !== currentUser.userId) {
        throw new ForbiddenException(
          'Bạn chỉ có thể sửa thông tin của chính mình',
        );
      }
      if (dto.role !== undefined || dto.password !== undefined) {
        throw new ForbiddenException(
          'Chỉ có thể tự sửa tên và số điện thoại của chính mình — đổi mật khẩu vui lòng dùng chức năng riêng',
        );
      }
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS)
      : undefined;

    try {
      const user = await this.usersService.update(
        id,
        {
          name: dto.name,
          phone: dto.phone,
          role: dto.role,
          passwordHash,
        },
        currentUser.userId,
      );
      return this.usersService.sanitize(user);
    } catch (error) {
      throw translateUniqueConstraintError(error, {
        phone: DUPLICATE_PHONE_MESSAGE,
      });
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    await this.usersService.remove(id, currentUser.userId);
  }

  /**
   * Đưa/gỡ user khỏi danh sách đen — dùng khi xác nhận khách chiếm giữ/không
   * trả thiết bị (mục 7 Roadmap, mở rộng 22/10 buổi 6). Kế thừa `@Roles(admin)`
   * cấp class — staff KHÔNG gọi được (hành động nghiêm trọng, chỉ admin).
   * Chặn đặt thuê thật sự nằm ở `BookingsService.create()`; chặn "theo CCCD
   * không chỉ theo tài khoản" nằm ở `UsersService.remove()` (xem comment đó).
   */
  @Patch(':id/blacklist')
  async setBlacklist(
    @Param('id') id: string,
    @Body() dto: SetUserBlacklistDto,
    @CurrentUser() currentUser: RequestUser,
  ) {
    const user = await this.usersService.setBlacklistStatus(
      id,
      dto.blacklisted,
      dto.reason,
      currentUser.userId,
    );
    return this.usersService.sanitize(user);
  }

  /**
   * Giải mã CCCD đầy đủ để admin xác minh tranh chấp thật — endpoint DUY NHẤT
   * trong toàn hệ thống trả CCCD không che. Kế thừa `@Roles(Role.admin)` ở cấp
   * class (KHÔNG có method-level `@Roles` riêng ở đây, khác hẳn `update()` phía
   * trên) — staff/customer không gọi được, kể cả tự xem CCCD của chính mình
   * (đã có bản mask trong `GET /auth/profile`/`GET /users/:id` rồi).
   */
  @Get(':id/cccd')
  async revealCccd(@Param('id') id: string) {
    const encryptionKey = this.configService.get<string>('CCCD_ENCRYPTION_KEY');
    const cccd = await this.usersService.revealCccd(id, encryptionKey!);
    return { cccd };
  }

  /**
   * Admin xem ảnh KYC (CCCD mặt trước/sau + ảnh chân dung) để xác minh tranh
   * chấp thật — dùng trong trang chi tiết user HOẶC booking ở frontend. Kế
   * thừa `@Roles(Role.admin)` cấp class (giống `revealCccd` ở trên) — không
   * có method-level `@Roles` riêng, staff/customer không gọi được.
   *
   * Mỗi URL trả về chỉ sống `KYC_IMAGE_VIEW_TTL_SECONDS` (5 phút) — sinh MỚI
   * mỗi lần gọi endpoint này, KHÔNG BAO GIỜ cache/lưu lại URL cũ. Đã verify
   * THẬT (không chỉ tin tài liệu Cloudinary) rằng hạn này được chính Cloudinary
   * kiểm tra ở tầng API (`401 Stale request` sau khi hết hạn) — xem UploadService.
   */
  @Get(':id/kyc-images')
  async getKycImages(@Param('id') id: string) {
    const user = await this.usersService.findByIdOrThrow(id);
    const images = KYC_IMAGE_SLOTS.filter((s) => !!user[s.field]).map((s) => ({
      slot: s.slot,
      label: s.label,
      url: this.uploadService.generateKycImageViewUrl(
        user[s.field]!,
        KYC_IMAGE_VIEW_TTL_SECONDS,
      ),
    }));
    return {
      submitted: images.length === KYC_IMAGE_SLOTS.length,
      expiresInSeconds: KYC_IMAGE_VIEW_TTL_SECONDS,
      images,
    };
  }

  /**
   * Admin RESET hồ sơ KYC (ảnh mờ/sai/hết hạn...) — xoá CẢ ảnh trên Cloudinary
   * (không để lại ảnh nhạy cảm nằm mồ côi vô thời hạn trên storage) LẪN
   * `public_id` trong DB, để khách tự nộp lại qua `PATCH /auth/kyc-verification`
   * (endpoint đó chặn nộp lại nếu đã đủ cả 3 ảnh — CHỈ admin reset được).
   */
  @Patch(':id/kyc-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetKycImages(@Param('id') id: string) {
    const previous = await this.usersService.resetKycImages(id);
    await Promise.all(
      KYC_IMAGE_SLOTS.map((s) => {
        const publicId = previous[s.field];
        return publicId ? this.uploadService.deleteKycImage(publicId) : null;
      }),
    );
  }
}
