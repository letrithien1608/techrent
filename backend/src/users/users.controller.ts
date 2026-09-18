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
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const PASSWORD_SALT_ROUNDS = 10;
const DUPLICATE_PHONE_MESSAGE =
  'Số điện thoại này đã được đăng ký bởi một tài khoản khác';

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.admin)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
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
    return this.usersService.findAll(
      query.page ?? 1,
      query.limit ?? 20,
      query.role,
      query.search,
    );
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
   * Giải mã CCCD đầy đủ để admin xác minh tranh chấp thật — endpoint DUY NHẤT
   * trong toàn hệ thống trả CCCD không che. Kế thừa `@Roles(Role.admin)` ở cấp
   * class (KHÔNG có method-level `@Roles` riêng ở đây, khác hẳn `update()` phía
   * trên) — staff/customer không gọi được, kể cả tự xem CCCD của chính mình
   * (đã có bản mask trong `GET /auth/profile`/`GET /users/:id` rồi).
   */
  @Get(':id/cccd')
  async revealCccd(@Param('id') id: string) {
    const encryptionKey = this.configService.get<string>(
      'CCCD_ENCRYPTION_KEY',
    );
    const cccd = await this.usersService.revealCccd(id, encryptionKey!);
    return { cccd };
  }
}
