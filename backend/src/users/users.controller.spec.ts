import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { Prisma, Role } from '../generated/prisma/client';
import { UploadService } from '../upload/upload.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

function makeP2002Error(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

const currentAdmin: RequestUser = {
  userId: 'admin-1',
  email: 'admin@example.com',
  role: Role.admin,
};

const currentCustomer: RequestUser = {
  userId: 'customer-1',
  email: 'customer@example.com',
  role: Role.customer,
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
    revealCccd: jest.Mock;
    resetKycImages: jest.Mock;
    setBlacklistStatus: jest.Mock;
    sanitize: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let uploadService: {
    generateKycImageViewUrl: jest.Mock;
    deleteKycImage: jest.Mock;
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findByIdOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findAll: jest.fn(),
      revealCccd: jest.fn(),
      resetKycImages: jest.fn(),
      setBlacklistStatus: jest.fn(),
      sanitize: jest.fn((user) => ({
        id: user.id,
        email: user.email,
        role: user.role,
      })),
    };
    configService = {
      get: jest.fn().mockReturnValue('a'.repeat(64)),
    };
    uploadService = {
      generateKycImageViewUrl: jest.fn(
        (publicId: string) => `https://signed.example.com/${publicId}`,
      ),
      deleteKycImage: jest.fn().mockResolvedValue(undefined),
    };
    controller = new UsersController(
      usersService as unknown as UsersService,
      configService as any,
      uploadService as unknown as UploadService,
    );
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

    it('dịch lỗi P2002 (trùng phone) thành ConflictException thân thiện, không lộ lỗi Prisma thô', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockRejectedValue(makeP2002Error(['phone']));

      await expect(
        controller.create({
          name: 'A',
          email: 'a@example.com',
          password: 'Str0ngP@ssword',
          phone: '0901234567',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
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
        undefined,
      );
    });

    it('truyền tiếp role/search/isBlacklisted từ query xuống UsersService.findAll', async () => {
      usersService.findAll.mockResolvedValue({ data: [], meta: {} });

      await controller.findAll({
        page: 1,
        limit: 20,
        role: Role.staff,
        search: 'an',
        isBlacklisted: true,
      });

      expect(usersService.findAll).toHaveBeenCalledWith(
        1,
        20,
        Role.staff,
        'an',
        true,
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

    // Route này CỐ Ý mở cho customer/staff tự sửa hồ sơ chính mình (trang
    // /profile) — method-level @Roles override class-level @Roles(admin).
    // Phải tự kiểm tra quyền trong controller vì RolesGuard chỉ còn chặn
    // "đã đăng nhập", không còn chặn theo role cho riêng route update() nữa.
    describe('khách hàng/staff tự sửa hồ sơ (không phải admin)', () => {
      it('cho phép tự sửa tên/SĐT của CHÍNH mình', async () => {
        usersService.update.mockImplementation((_id, data) =>
          Promise.resolve({ id: 'customer-1', ...data }),
        );

        await controller.update(
          'customer-1',
          { name: 'Tên mới', phone: '0900000000' },
          currentCustomer,
        );

        expect(usersService.update).toHaveBeenCalledWith(
          'customer-1',
          expect.objectContaining({ name: 'Tên mới', phone: '0900000000' }),
          currentCustomer.userId,
        );
      });

      it('ném ForbiddenException nếu cố sửa người dùng KHÁC (id khác currentUser.userId)', async () => {
        await expect(
          controller.update(
            'someone-else-id',
            { name: 'Hack' },
            currentCustomer,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(usersService.update).not.toHaveBeenCalled();
      });

      it('ném ForbiddenException nếu cố gửi kèm field role (kể cả sửa đúng chính mình)', async () => {
        await expect(
          controller.update(
            'customer-1',
            { role: Role.admin },
            currentCustomer,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(usersService.update).not.toHaveBeenCalled();
      });

      it('ném ForbiddenException nếu cố gửi kèm field password (phải đổi qua /auth/change-password)', async () => {
        await expect(
          controller.update(
            'customer-1',
            { password: 'NewStr0ngPass1' },
            currentCustomer,
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(usersService.update).not.toHaveBeenCalled();
      });
    });

    it('dịch lỗi P2002 (trùng phone) thành ConflictException thân thiện', async () => {
      usersService.update.mockRejectedValue(makeP2002Error(['phone']));

      await expect(
        controller.update('u1', { phone: '0901234567' }, currentAdmin),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('gọi UsersService.remove với đúng id VÀ id của người đang gọi', async () => {
      await controller.remove('u1', currentAdmin);

      expect(usersService.remove).toHaveBeenCalledWith('u1', currentAdmin.userId);
    });
  });

  describe('revealCccd', () => {
    it('đọc CCCD_ENCRYPTION_KEY từ ConfigService và gọi UsersService.revealCccd', async () => {
      usersService.revealCccd.mockResolvedValue('079203012345');

      const result = await controller.revealCccd('u1');

      expect(configService.get).toHaveBeenCalledWith('CCCD_ENCRYPTION_KEY');
      expect(usersService.revealCccd).toHaveBeenCalledWith('u1', 'a'.repeat(64));
      expect(result).toEqual({ cccd: '079203012345' });
    });

    it('ném lại NotFoundException nếu UsersService.revealCccd báo user chưa có CCCD', async () => {
      usersService.revealCccd.mockRejectedValue(
        new NotFoundException('Người dùng này chưa có CCCD trong hồ sơ'),
      );

      await expect(controller.revealCccd('u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getKycImages', () => {
    it('submitted=true và trả đủ 3 URL có hạn khi user đã có đủ 3 ảnh KYC', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        id: 'u1',
        kycCccdFrontPublicId: 'kyc/u1-cccd-front',
        kycCccdBackPublicId: 'kyc/u1-cccd-back',
        kycSelfiePublicId: 'kyc/u1-selfie',
      });

      const result = await controller.getKycImages('u1');

      expect(result.submitted).toBe(true);
      expect(result.expiresInSeconds).toBe(300);
      expect(result.images).toHaveLength(3);
      expect(result.images.map((i) => i.slot)).toEqual([
        'cccd-front',
        'cccd-back',
        'selfie',
      ]);
      expect(uploadService.generateKycImageViewUrl).toHaveBeenCalledWith(
        'kyc/u1-cccd-front',
        300,
      );
    });

    it('submitted=false và CHỈ trả URL cho các slot đã có khi user chưa nộp đủ', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        id: 'u1',
        kycCccdFrontPublicId: 'kyc/u1-cccd-front',
        kycCccdBackPublicId: null,
        kycSelfiePublicId: null,
      });

      const result = await controller.getKycImages('u1');

      expect(result.submitted).toBe(false);
      expect(result.images).toHaveLength(1);
      expect(result.images[0].slot).toBe('cccd-front');
    });

    it('trả images rỗng, submitted=false nếu user chưa nộp KYC gì cả', async () => {
      usersService.findByIdOrThrow.mockResolvedValue({
        id: 'u1',
        kycCccdFrontPublicId: null,
        kycCccdBackPublicId: null,
        kycSelfiePublicId: null,
      });

      const result = await controller.getKycImages('u1');

      expect(result.submitted).toBe(false);
      expect(result.images).toEqual([]);
      expect(uploadService.generateKycImageViewUrl).not.toHaveBeenCalled();
    });
  });

  describe('resetKycImages', () => {
    it('xoá cả 3 ảnh trên Cloudinary (dùng public_id TRƯỚC khi reset) rồi mới xoá trong DB', async () => {
      usersService.resetKycImages.mockResolvedValue({
        id: 'u1',
        kycCccdFrontPublicId: 'kyc/u1-cccd-front',
        kycCccdBackPublicId: 'kyc/u1-cccd-back',
        kycSelfiePublicId: 'kyc/u1-selfie',
      });

      await controller.resetKycImages('u1');

      expect(usersService.resetKycImages).toHaveBeenCalledWith('u1');
      expect(uploadService.deleteKycImage).toHaveBeenCalledWith('kyc/u1-cccd-front');
      expect(uploadService.deleteKycImage).toHaveBeenCalledWith('kyc/u1-cccd-back');
      expect(uploadService.deleteKycImage).toHaveBeenCalledWith('kyc/u1-selfie');
      expect(uploadService.deleteKycImage).toHaveBeenCalledTimes(3);
    });

    it('KHÔNG gọi deleteKycImage cho slot nào chưa có ảnh (public_id null)', async () => {
      usersService.resetKycImages.mockResolvedValue({
        id: 'u1',
        kycCccdFrontPublicId: 'kyc/u1-cccd-front',
        kycCccdBackPublicId: null,
        kycSelfiePublicId: null,
      });

      await controller.resetKycImages('u1');

      expect(uploadService.deleteKycImage).toHaveBeenCalledTimes(1);
      expect(uploadService.deleteKycImage).toHaveBeenCalledWith('kyc/u1-cccd-front');
    });
  });

  describe('setBlacklist', () => {
    it('gọi UsersService.setBlacklistStatus với đúng id/blacklisted/reason/currentUserId', async () => {
      usersService.setBlacklistStatus.mockResolvedValue({
        id: 'u1',
        isBlacklisted: true,
      });

      await controller.setBlacklist(
        'u1',
        { blacklisted: true, reason: 'Không trả thiết bị' },
        currentAdmin,
      );

      expect(usersService.setBlacklistStatus).toHaveBeenCalledWith(
        'u1',
        true,
        'Không trả thiết bị',
        currentAdmin.userId,
      );
    });
  });
});
