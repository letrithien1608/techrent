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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

const PASSWORD_SALT_ROUNDS = 10;

@ApiTags('users')
@ApiBearerAuth()
@Roles(Role.admin)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
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
      role: dto.role ?? Role.customer,
    });
    return this.usersService.sanitize(user);
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
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: RequestUser,
  ) {
    await this.usersService.remove(id, currentUser.userId);
  }
}
