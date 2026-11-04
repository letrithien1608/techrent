import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { DevicesController } from '../devices/devices.controller';
import { DevicesService } from '../devices/devices.service';
import { Role } from '../generated/prisma/client';
import { RedisService } from '../redis/redis.service';
import { UploadService } from './upload.service';

/**
 * Quyền ở tầng HTTP với guard THẬT + token ký thật (service giả):
 * - avatar: chỉ đổi được của CHÍNH mình (không có route nhận id người khác);
 * - ảnh thiết bị: chỉ staff/admin tải lên/sắp xếp; kiểm tra loại file ở backend.
 */
describe('Quyền đổi avatar và sửa ảnh thiết bị (HTTP)', () => {
  const SECRET = 'test-access-secret';
  const jwt = new JwtService({ secret: SECRET });
  const tokenFor = (sub: string, role: Role) =>
    jwt.sign({ sub, email: `${sub}@test.vn`, role });
  const PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
  ]);
  const images = Array.from(
    { length: 5 },
    (_, i) =>
      `https://res.cloudinary.com/demo/image/upload/v1/techrent/devices/${i}.jpg`,
  );

  let app: INestApplication;
  const authService = {
    updateAvatar: jest.fn().mockResolvedValue({ id: 'u1', avatarUrl: 'x' }),
    removeAvatar: jest.fn().mockResolvedValue({ id: 'u1', avatarUrl: null }),
  };
  const devicesService = {
    replaceImages: jest.fn().mockResolvedValue({ id: 'd1' }),
  };
  const uploadService = { uploadImage: jest.fn().mockResolvedValue('url') };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, DevicesController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: DevicesService, useValue: devicesService },
        { provide: UploadService, useValue: uploadService },
        { provide: ConfigService, useValue: { get: () => SECRET } },
        {
          provide: RedisService,
          useValue: { isTokenBlacklisted: async () => false },
        },
        JwtStrategy,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  describe('ảnh đại diện', () => {
    it('chưa đăng nhập → 401', async () => {
      await request(app.getHttpServer())
        .patch('/auth/avatar')
        .attach('avatar', PNG, 'a.png')
        .expect(401);
      expect(authService.updateAvatar).not.toHaveBeenCalled();
    });

    it('đổi avatar luôn áp vào user TRONG TOKEN (không đổi hộ người khác được)', async () => {
      await request(app.getHttpServer())
        .patch('/auth/avatar')
        .set('Authorization', `Bearer ${tokenFor('khach-1', Role.customer)}`)
        .attach('avatar', PNG, 'a.png')
        .expect(200);
      expect(authService.updateAvatar).toHaveBeenCalledWith(
        'khach-1',
        expect.objectContaining({ buffer: expect.any(Buffer) }),
      );
    });

    it('không có route đổi avatar theo id user khác', async () => {
      await request(app.getHttpServer())
        .patch('/auth/avatar/khach-2')
        .set('Authorization', `Bearer ${tokenFor('khach-1', Role.customer)}`)
        .attach('avatar', PNG, 'a.png')
        .expect(404);
    });

    it('xoá avatar của chính mình', async () => {
      await request(app.getHttpServer())
        .delete('/auth/avatar')
        .set('Authorization', `Bearer ${tokenFor('khach-1', Role.customer)}`)
        .expect(200);
      expect(authService.removeAvatar).toHaveBeenCalledWith('khach-1');
    });
  });

  describe('ảnh thiết bị', () => {
    it('khách hàng tải ảnh / lưu bộ ảnh → 403', async () => {
      const token = tokenFor('khach-1', Role.customer);
      await request(app.getHttpServer())
        .post('/devices/images/upload')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', PNG, 'a.png')
        .expect(403);
      await request(app.getHttpServer())
        .put('/devices/d1/images')
        .set('Authorization', `Bearer ${token}`)
        .send({ images })
        .expect(403);
      expect(uploadService.uploadImage).not.toHaveBeenCalled();
      expect(devicesService.replaceImages).not.toHaveBeenCalled();
    });

    it.each([Role.staff, Role.admin])(
      '%s tải ảnh hợp lệ → 201',
      async (role) => {
        const res = await request(app.getHttpServer())
          .post('/devices/images/upload')
          .set('Authorization', `Bearer ${tokenFor('nv', role)}`)
          .attach('image', PNG, 'a.png')
          .expect(201);
        expect(res.body).toEqual({ url: 'url' });
        expect(uploadService.uploadImage).toHaveBeenCalledWith(
          expect.any(Buffer),
          'image/png',
        );
      },
    );

    it('file giả mạo (khai báo image/jpeg nhưng nội dung là PDF) → 400, không upload', async () => {
      const res = await request(app.getHttpServer())
        .post('/devices/images/upload')
        .set('Authorization', `Bearer ${tokenFor('nv', Role.staff)}`)
        .attach('image', Buffer.from('%PDF-1.7 fake'), {
          filename: 'anh.jpg',
          contentType: 'image/jpeg',
        })
        .expect(400);
      expect(res.body.message).toContain('JPG, PNG hoặc WEBP');
      expect(uploadService.uploadImage).not.toHaveBeenCalled();
    });

    it('staff lưu bộ ảnh đã sắp xếp → gọi service đúng thứ tự', async () => {
      await request(app.getHttpServer())
        .put('/devices/d1/images')
        .set('Authorization', `Bearer ${tokenFor('nv', Role.staff)}`)
        .send({ images })
        .expect(200);
      expect(devicesService.replaceImages).toHaveBeenCalledWith(
        'd1',
        images,
        undefined,
      );
    });

    it('dưới 5 ảnh → 400 "tối thiểu 5 ảnh" ngay ở DTO', async () => {
      const res = await request(app.getHttpServer())
        .put('/devices/d1/images')
        .set('Authorization', `Bearer ${tokenFor('nv', Role.admin)}`)
        .send({ images: images.slice(0, 4) })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('tối thiểu 5 ảnh');
      expect(devicesService.replaceImages).not.toHaveBeenCalled();
    });
  });
});
