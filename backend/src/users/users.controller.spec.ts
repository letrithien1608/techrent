import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../generated/prisma/client';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const currentAdmin: RequestUser = {
  userId: 'admin-1',
  email: 'admin@example.com',
  role: Role.admin,
};

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findByEmail: jest.Mock;
    findByIdOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    findAll: jest.Mock;
    sanitize: jest.Mock;
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findByIdOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findAll: jest.fn(),
      sanitize: jest.fn((user) => ({
        id: user.id,
        email: user.email,
        role: user.role,
      })),
    };
    controller = new UsersController(usersService as unknown as UsersService);
  });

  describe('create', () => {
    it('ném ConflictException nếu email đã tồn tại', async () => {
      usersService.findByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        controller.create({
          name: 'A',
          email: 'a@example.com',
          password: 'Str0ngP@ssword',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('hash mật khẩu bằng bcrypt và mặc định role customer nếu không truyền role', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation((data) =>
        Promise.resolve({ id: 'new-id', ...data }),
      );

      await controller.create({
        name: 'A',
        email: 'a@example.com',
        password: 'Str0ngP@ssword',
      });

      const createdArg = usersService.create.mock.calls[0][0];
      expect(createdArg.role).toBe(Role.customer);
      expect(createdArg.passwordHash).not.toBe('Str0ngP@ssword');
      expect(
        await bcrypt.compare('Str0ngP@ssword', createdArg.passwordHash),
      ).toBe(true);
    });

    it('cho phép admin gán role cụ thể (VD staff) khi tạo user', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockImplementation((data) =>
        Promise.resolve({ id: 'new-id', ...data }),
      );

      await controller.create({
        name: 'B',
        email: 'staff@example.com',
        password: 'Str0ngP@ssword',
        role: Role.staff,
      });

      expect(usersService.create.mock.calls[0][0].role).toBe(Role.staff);
    });
  });

  describe('findAll', () => {
    it('gọi UsersService.findAll với page/limit từ query (áp dụng mặc định nếu thiếu)', async () => {
      usersService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll({ page: 2, limit: 10 });

      expect(usersService.findAll).toHaveBeenCalledWith(
        2,
        10,
        undefined,
        undefined,
      );
    });

    it('truyền tiếp role/search từ query xuống UsersService.findAll', async () => {
      usersService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll({
        page: 1,
        limit: 20,
        role: Role.staff,
        search: 'an',
      });

      expect(usersService.findAll).toHaveBeenCalledWith(
        1,
        20,
        Role.staff,
        'an',
      );
    });
  });

  describe('update', () => {
    it('hash lại mật khẩu nếu admin có truyền password mới', async () => {
      usersService.update.mockImplementation((_id, data) =>
        Promise.resolve({ id: 'u1', ...data }),
      );

      await controller.update('u1', { password: 'NewStr0ngP@ss' }, currentAdmin);

      const updateArg = usersService.update.mock.calls[0][1];
      expect(updateArg.passwordHash).toBeDefined();
      expect(
        await bcrypt.compare('NewStr0ngP@ss', updateArg.passwordHash),
      ).toBe(true);
    });

    it('không đụng tới passwordHash nếu admin không truyền password', async () => {
      usersService.update.mockImplementation((_id, data) =>
        Promise.resolve({ id: 'u1', ...data }),
      );

      await controller.update('u1', { name: 'Tên mới' }, currentAdmin);

      const updateArg = usersService.update.mock.calls[0][1];
      expect(updateArg.passwordHash).toBeUndefined();
    });

    it('truyền id của người đang gọi (currentUser.userId) xuống UsersService.update để service tự chặn tự-đổi-role', async () => {
      usersService.update.mockImplementation((_id, data) =>
        Promise.resolve({ id: 'u1', ...data }),
      );

      await controller.update('u1', { role: Role.staff }, currentAdmin);

      expect(usersService.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ role: Role.staff }),
        currentAdmin.userId,
      );
    });
  });

  describe('remove', () => {
    it('gọi UsersService.remove với đúng id VÀ id của người đang gọi', async () => {
      await controller.remove('u1', currentAdmin);

      expect(usersService.remove).toHaveBeenCalledWith('u1', currentAdmin.userId);
    });
  });
});
