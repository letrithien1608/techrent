import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { Role } from '../generated/prisma/client';
import { RedisService } from '../redis/redis.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

/**
 * Phân quyền hợp đồng ở tầng HTTP: guard THẬT (JwtAuthGuard + RolesGuard +
 * JwtStrategy), token ký thật, chỉ BookingsService là giả. Kiểm tra quyền sở
 * hữu đơn + bản CCCD che/đầy đủ nằm ở bookings.service.spec.ts.
 */
describe('BookingsController — quyền xem hợp đồng (HTTP)', () => {
  const SECRET = 'test-access-secret';
  const jwt = new JwtService({ secret: SECRET });
  const tokenFor = (sub: string, role: Role) =>
    jwt.sign({ sub, email: `${sub}@test.vn`, role });

  let app: INestApplication;
  const service = {
    getOwnContract: jest.fn().mockResolvedValue({
      html: '<html>CCCD ********1234</html>',
      signed: false,
      signedAt: null,
    }),
    getOwnContractPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
    getContractForPrint: jest.fn().mockResolvedValue({
      html: '<html>CCCD 079204001234</html>',
      signed: false,
      signedAt: null,
    }),
    getContractPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.7')),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: service },
        {
          provide: ConfigService,
          useValue: { get: () => SECRET },
        },
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
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it.each(['my-contract', 'my-contract/pdf', 'contract', 'contract/pdf'])(
    'chưa đăng nhập gọi /bookings/:id/%s → 401',
    async (path) => {
      await request(app.getHttpServer())
        .get(`/bookings/booking-1/${path}`)
        .expect(401);
      expect(service.getOwnContract).not.toHaveBeenCalled();
      expect(service.getContractForPrint).not.toHaveBeenCalled();
    },
  );

  it('khách đăng nhập: lấy hợp đồng qua my-contract, service nhận đúng user từ token', async () => {
    const res = await request(app.getHttpServer())
      .get('/bookings/booking-1/my-contract')
      .set('Authorization', `Bearer ${tokenFor('user-1', Role.customer)}`)
      .expect(200);

    expect(res.body.html).toContain('********1234');
    expect(service.getOwnContract).toHaveBeenCalledWith(
      'booking-1',
      expect.objectContaining({ userId: 'user-1', role: Role.customer }),
    );
  });

  it('khách tải PDF: trả application/pdf dạng tệp đính kèm', async () => {
    const res = await request(app.getHttpServer())
      .get('/bookings/booking-1/my-contract/pdf')
      .set('Authorization', `Bearer ${tokenFor('user-1', Role.customer)}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('khách gọi endpoint bản CCCD đầy đủ của nhân viên → 403', async () => {
    for (const path of ['contract', 'contract/pdf']) {
      await request(app.getHttpServer())
        .get(`/bookings/booking-1/${path}`)
        .set('Authorization', `Bearer ${tokenFor('user-1', Role.customer)}`)
        .expect(403);
    }
    expect(service.getContractForPrint).not.toHaveBeenCalled();
    expect(service.getContractPdf).not.toHaveBeenCalled();
  });

  it.each([Role.staff, Role.admin])(
    '%s vẫn lấy được bản CCCD đầy đủ',
    async (role) => {
      const res = await request(app.getHttpServer())
        .get('/bookings/booking-1/contract')
        .set('Authorization', `Bearer ${tokenFor('staff-1', role)}`)
        .expect(200);

      expect(res.body.html).toContain('079204001234');
      expect(service.getContractForPrint).toHaveBeenCalledWith(
        'booking-1',
        'staff-1',
      );
    },
  );
});
