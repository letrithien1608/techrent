import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  BookingStatus,
  Role,
  SocialProvider,
} from '../src/generated/prisma/client';

/**
 * Tìm kiếm + bộ lọc trang quản trị chạy trên Postgres THẬT (unaccent, khoảng
 * ngày giờ VN, phân trang). Dữ liệu test gắn mốc `stamp` để không lẫn với
 * dữ liệu có sẵn — mọi câu tìm đều kèm mốc này.
 */
describe('Tìm kiếm quản trị (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const stamp = String(Date.now());
  const marker = `e2e${stamp}`;
  const password = 'Str0ngP@ssword';
  const phoneA = `08${stamp.slice(-8)}`;
  const cccdLast4 = stamp.slice(-4);

  const ids = {
    category: '',
    canon: '',
    sony: '',
    userA: '',
    userB: '',
    demo: '',
    customer: '',
    staff: '',
    admin: '',
    b1: '',
    b2: '',
    b3: '',
  };
  const tokens = { customer: '', staff: '', admin: '' };

  async function login(email: string) {
    const res = await request(server)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async function createUser(
    key: 'userA' | 'userB' | 'demo' | 'customer' | 'staff' | 'admin',
    data: { name: string; email: string; role?: Role; withPassword?: boolean },
    extra: Record<string, unknown> = {},
  ) {
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role ?? Role.customer,
        passwordHash:
          data.withPassword === false ? null : await bcrypt.hash(password, 4),
        ...extra,
      },
    });
    ids[key] = user.id;
  }

  const search = (path: string, query: Record<string, string | number>) =>
    request(server)
      .get(path)
      .query(query)
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);

  const bookingIds = async (query: Record<string, string | number>) =>
    (await search('/bookings/search', query)).body.data.map(
      (b: { id: string }) => b.id,
    );
  const userIds = async (query: Record<string, string | number>) =>
    (await search('/users', query)).body.data.map((u: { id: string }) => u.id);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpServer();
    prisma = moduleFixture.get(PrismaService);

    const category = await prisma.category.create({
      data: { name: `Search E2E ${stamp}` },
    });
    ids.category = category.id;
    const device = (name: string, serial: string) =>
      prisma.device.create({
        data: {
          name,
          serialNumber: serial,
          categoryId: category.id,
          pricePerHour: 10000,
          pricePerDay: 80000,
          originalPrice: 20000000,
        },
      });
    ids.canon = (
      await device(`Canon EOS R6 Mark II ${marker}`, `SRCH${stamp}A`)
    ).id;
    ids.sony = (await device(`Sony Alpha 7 IV ${marker}`, `SRCH${stamp}B`)).id;

    await createUser(
      'userA',
      { name: 'Đặng Quỳnh Hương', email: `search-a-${stamp}@example.com` },
      {
        phone: phoneA,
        cccdMasked: `********${cccdLast4}`,
        kycCccdFrontPublicId: 'techrent/kyc/x1',
        kycCccdBackPublicId: 'techrent/kyc/x2',
        kycSelfiePublicId: 'techrent/kyc/x3',
      },
    );
    await createUser(
      'userB',
      {
        name: 'Trần Bảo',
        email: `search-b-${stamp}@example.com`,
        withPassword: false,
      },
      {
        socialAccounts: {
          create: {
            provider: SocialProvider.google,
            providerUserId: `google-${stamp}`,
          },
        },
      },
    );
    await createUser('demo', {
      name: 'Khách Mẫu',
      email: `demo.review-${stamp}@techrent.test`,
    });
    await createUser('customer', {
      name: 'Khách Thường',
      email: `search-c-${stamp}@example.com`,
    });
    await createUser('staff', {
      name: 'Nhân Viên',
      email: `search-s-${stamp}@example.com`,
      role: Role.staff,
    });
    await createUser('admin', {
      name: 'Quản Trị',
      email: `search-ad-${stamp}@example.com`,
      role: Role.admin,
    });
    tokens.customer = await login(`search-c-${stamp}@example.com`);
    tokens.staff = await login(`search-s-${stamp}@example.com`);
    tokens.admin = await login(`search-ad-${stamp}@example.com`);

    const booking = (data: Record<string, unknown>) =>
      prisma.booking.create({
        data: {
          status: BookingStatus.completed,
          depositAmount: 10000000,
          ...data,
        } as never,
      });
    // b1: giờ VN 06/11 00:30–01:00 (= 05/11 theo giờ UTC), còn nợ 200k.
    ids.b1 = (
      await booking({
        userId: ids.userA,
        deviceId: ids.canon,
        startTime: new Date('2026-11-05T17:30:00Z'),
        endTime: new Date('2026-11-05T18:00:00Z'),
        totalPrice: 500000,
        amountOwed: 200000,
      })
    ).id;
    // b2: giờ VN 05/11 10:00–12:00, đang thuê, nghi mất, giá trị cao nhất.
    ids.b2 = (
      await booking({
        userId: ids.userB,
        deviceId: ids.sony,
        startTime: new Date('2026-11-05T03:00:00Z'),
        endTime: new Date('2026-11-05T05:00:00Z'),
        status: BookingStatus.ongoing,
        suspectedLostAt: new Date(),
        totalPrice: 900000,
      })
    ).id;
    // b3: đơn dữ liệu mẫu, giờ VN 05/11 14:00–15:00.
    ids.b3 = (
      await booking({
        userId: ids.demo,
        deviceId: ids.canon,
        startTime: new Date('2026-11-05T07:00:00Z'),
        endTime: new Date('2026-11-05T08:00:00Z'),
        totalPrice: 100000,
        isDemo: true,
      })
    ).id;
  }, 60000);

  afterAll(async () => {
    const userIdList = [
      ids.userA,
      ids.userB,
      ids.demo,
      ids.customer,
      ids.staff,
      ids.admin,
    ].filter(Boolean);
    await prisma.booking.deleteMany({
      where: { deviceId: { in: [ids.canon, ids.sony] } },
    });
    await prisma.device.deleteMany({ where: { categoryId: ids.category } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.user.deleteMany({ where: { id: { in: userIdList } } });
    await app.close();
  });

  describe('GET /bookings/search', () => {
    it('không dấu / hoa thường vẫn ra tên có dấu', async () => {
      expect(await bookingIds({ q: `dang quynh huong ${marker}` })).toEqual([
        ids.b1,
      ]);
      expect(await bookingIds({ q: `ĐẶNG QUỲNH ${marker}` })).toEqual([ids.b1]);
    });

    it('"canon r6" ra "Canon EOS R6 Mark II" (từng từ khớp ở bất kỳ đâu)', async () => {
      expect(await bookingIds({ q: `canon r6 ${marker}` })).toEqual([ids.b1]);
    });

    it('theo SĐT khách (có khoảng trắng), theo serial, theo vài ký tự đầu mã đơn', async () => {
      const spaced = `${phoneA.slice(0, 4)} ${phoneA.slice(4, 7)} ${phoneA.slice(7)}`;
      expect(await bookingIds({ q: spaced })).toEqual([ids.b1]);
      expect(await bookingIds({ q: `srch${stamp}b` })).toEqual([ids.b2]);
      const code = `#${ids.b2.slice(0, 8).toUpperCase()}`;
      expect(await bookingIds({ q: code })).toEqual([ids.b2]);
    });

    it('kết hợp nhiều bộ lọc', async () => {
      expect(
        await bookingIds({
          q: marker,
          status: 'ongoing',
          suspectedLost: 'true',
        }),
      ).toEqual([ids.b2]);
      expect(await bookingIds({ q: marker, hasDebt: 'true' })).toEqual([
        ids.b1,
      ]);
      expect(
        await bookingIds({ q: marker, hasDebt: 'true', status: 'ongoing' }),
      ).toEqual([]);
    });

    it('khoảng ngày tính theo giờ Việt Nam', async () => {
      // b1 là 05/11 theo giờ UTC nhưng 06/11 theo giờ VN.
      expect(
        await bookingIds({ q: marker, from: '2026-11-05', to: '2026-11-05' }),
      ).toEqual([ids.b2]);
      expect(
        await bookingIds({ q: marker, from: '2026-11-06', to: '2026-11-06' }),
      ).toEqual([ids.b1]);
      await request(server)
        .get('/bookings/search')
        .query({ from: '2026-11-06', to: '2026-11-05' })
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(400);
    });

    it('mặc định ẩn đơn dữ liệu mẫu; hideDemo=false thì hiện', async () => {
      const day = { q: marker, from: '2026-11-05', to: '2026-11-05' };
      expect(await bookingIds(day)).toEqual([ids.b2]);
      expect((await bookingIds({ ...day, hideDemo: 'false' })).sort()).toEqual(
        [ids.b2, ids.b3].sort(),
      );
    });

    it('phân trang trả đúng tổng số, sắp theo giá trị', async () => {
      const page2 = await search('/bookings/search', {
        q: marker,
        limit: 1,
        page: 2,
        sort: 'value',
      });
      expect(page2.body.meta).toEqual({
        page: 2,
        limit: 1,
        total: 2,
        totalPages: 2,
      });
      expect(page2.body.data.map((b: { id: string }) => b.id)).toEqual([
        ids.b1,
      ]);
      expect(page2.body.data[0].device.serialNumber).toBe(`SRCH${stamp}A`);
      expect(page2.body.data[0].user.email).toBe(
        `search-a-${stamp}@example.com`,
      );
    });

    it('khách hàng gọi → 403, nhân viên gọi được', async () => {
      await request(server)
        .get('/bookings/search')
        .set('Authorization', `Bearer ${tokens.customer}`)
        .expect(403);
      await request(server)
        .get('/bookings/search')
        .query({ q: marker })
        .set('Authorization', `Bearer ${tokens.staff}`)
        .expect(200);
    });
  });

  describe('GET /users (tìm + lọc)', () => {
    it('không dấu, theo email, theo SĐT, theo 4 số cuối CCCD', async () => {
      expect(await userIds({ search: `dang quynh ${stamp}` })).toEqual([
        ids.userA,
      ]);
      expect(await userIds({ search: phoneA })).toEqual([ids.userA]);
      expect(await userIds({ search: cccdLast4 })).toContain(ids.userA);
    });

    it('cách đăng nhập, eKYC, còn nợ', async () => {
      const q = { search: `search ${stamp}` };
      expect(await userIds({ ...q, loginMethod: 'google' })).toEqual([
        ids.userB,
      ]);
      expect(await userIds({ ...q, loginMethod: 'password' })).not.toContain(
        ids.userB,
      );
      expect(await userIds({ ...q, kycStatus: 'verified' })).toEqual([
        ids.userA,
      ]);
      expect(await userIds({ ...q, kycStatus: 'none' })).toContain(ids.userB);
      expect(await userIds({ ...q, hasDebt: 'true' })).toEqual([ids.userA]);
    });

    it('mặc định ẩn tài khoản dữ liệu mẫu demo.review*', async () => {
      const q = `review-${stamp}`;
      expect(await userIds({ search: q })).not.toContain(ids.demo);
      expect(await userIds({ search: q, hideDemo: 'false' })).toContain(
        ids.demo,
      );
    });

    it('danh sách không lộ CCCD đầy đủ, kèm cách đăng nhập + còn nợ', async () => {
      const res = await search('/users', { search: `dang quynh ${stamp}` });
      const row = res.body.data[0];
      expect(row.cccdMasked).toBe(`********${cccdLast4}`);
      expect(row).not.toHaveProperty('cccdEncrypted');
      expect(row).not.toHaveProperty('cccdHash');
      expect(row).toMatchObject({ hasDebt: true, socialProviders: [] });
    });

    it('sắp xếp tên A–Z theo tên đã bỏ dấu', async () => {
      const ordered = await userIds({
        search: `search ${stamp}`,
        sort: 'name',
      });
      // "Đặng" (D) < "Khách" (K) < "Nhân" (N) < "Quản" (Q) < "Trần" (T)
      expect(ordered).toEqual([
        ids.userA,
        ids.customer,
        ids.staff,
        ids.admin,
        ids.userB,
      ]);
    });

    it('khách hàng và nhân viên gọi → 403 (chỉ admin)', async () => {
      for (const token of [tokens.customer, tokens.staff]) {
        await request(server)
          .get('/users')
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }
    });
  });
});
