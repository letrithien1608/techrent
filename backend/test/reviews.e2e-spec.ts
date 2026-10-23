import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BookingStatus, Role } from '../src/generated/prisma/client';

/**
 * Luật đánh giá thiết bị chạy trên Postgres thật: chỉ người đã thuê VÀ trả máy
 * mới đánh giá được, mỗi người 1 đánh giá/thiết bị, sửa/xoá của chính mình,
 * admin ẩn/hiện kèm lý do, điểm trung bình của thiết bị luôn tính lại đúng.
 */
describe('Reviews (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const stamp = Date.now();
  const password = 'Str0ngP@ssword';
  const ids = { category: '', device: '', customer: '', other: '', admin: '' };
  const tokens = { customer: '', other: '', admin: '' };
  let reviewId = '';

  async function createUser(key: 'customer' | 'other' | 'admin', name: string) {
    const email = `review-e2e-${key}-${stamp}@example.com`;
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: key === 'admin' ? Role.admin : Role.customer,
      },
    });
    ids[key] = user.id;
    const login = await request(server)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    tokens[key] = login.body.accessToken;
  }

  const auth = (key: keyof typeof tokens) => ({
    Authorization: `Bearer ${tokens[key]}`,
  });

  async function deviceRating() {
    return prisma.device.findUniqueOrThrow({
      where: { id: ids.device },
      select: { avgRating: true, reviewCount: true },
    });
  }

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
      data: { name: `Review E2E ${stamp}` },
    });
    ids.category = category.id;
    const device = await prisma.device.create({
      data: {
        name: `Review E2E Device ${stamp}`,
        categoryId: category.id,
        pricePerHour: 10000,
        pricePerDay: 80000,
        originalPrice: 20000000,
      },
    });
    ids.device = device.id;

    await createUser('customer', 'Nguyễn Văn An');
    await createUser('other', 'Trần Thị Bình');
    await createUser('admin', 'Quản Trị Viên');
  }, 60000);

  afterAll(async () => {
    const userIds = [ids.customer, ids.other, ids.admin];
    await prisma.review.deleteMany({ where: { deviceId: ids.device } });
    await prisma.booking.deleteMany({ where: { deviceId: ids.device } });
    await prisma.device.deleteMany({ where: { id: ids.device } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const comment = 'Máy chạy êm, pin trâu, giao nhận nhanh gọn.';

  it('chưa thuê/trả thiết bị → không được đánh giá', async () => {
    const res = await request(server)
      .post('/reviews')
      .set(auth('customer'))
      .send({ deviceId: ids.device, rating: 5, comment })
      .expect(403);
    expect(res.body.message).toBe(
      'Bạn cần thuê và trả thiết bị này để đánh giá',
    );

    // Đơn đang thuê (chưa trả) vẫn chưa đủ điều kiện.
    await prisma.booking.create({
      data: {
        userId: ids.customer,
        deviceId: ids.device,
        startTime: new Date('2026-03-01T02:00:00Z'),
        endTime: new Date('2026-03-03T02:00:00Z'),
        status: BookingStatus.ongoing,
        totalPrice: 160000,
        depositAmount: 10000000,
      },
    });
    await request(server)
      .post('/reviews')
      .set(auth('customer'))
      .send({ deviceId: ids.device, rating: 5, comment })
      .expect(403);
    const me = await request(server)
      .get('/reviews/me')
      .query({ deviceId: ids.device })
      .set(auth('customer'))
      .expect(200);
    expect(me.body).toMatchObject({ canReview: false, reason: 'not_rented' });
  });

  it('đã trả máy → đánh giá được, chặn spam và chặn đánh giá lần 2', async () => {
    await prisma.booking.updateMany({
      where: { userId: ids.customer, deviceId: ids.device },
      data: { status: BookingStatus.completed },
    });

    await request(server)
      .post('/reviews')
      .set(auth('customer'))
      .send({
        deviceId: ids.device,
        rating: 5,
        comment: 'Rẻ hơn ở www.abc.com',
      })
      .expect(400);

    const created = await request(server)
      .post('/reviews')
      .set(auth('customer'))
      .send({ deviceId: ids.device, rating: 5, comment })
      .expect(201);
    reviewId = created.body.id;

    await request(server)
      .post('/reviews')
      .set(auth('customer'))
      .send({ deviceId: ids.device, rating: 4, comment })
      .expect(409);

    expect(await deviceRating()).toEqual({ avgRating: 5, reviewCount: 1 });
  });

  it('trang công khai: tên đã che, có huy hiệu đã thuê, không lộ userId', async () => {
    const list = await request(server)
      .get('/reviews')
      .query({ deviceId: ids.device })
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.data[0]).toMatchObject({
      reviewerName: 'Nguyễn V. A',
      verifiedRental: true,
      comment,
    });
    expect(JSON.stringify(list.body)).not.toContain(ids.customer);

    const summary = await request(server)
      .get('/reviews/summary')
      .query({ deviceId: ids.device })
      .expect(200);
    expect(summary.body).toMatchObject({
      avgRating: 5,
      reviewCount: 1,
      distribution: { 5: 1, 4: 0 },
    });
  });

  it('chỉ chủ đánh giá được sửa; sửa → "đã chỉnh sửa" + tính lại điểm', async () => {
    await request(server)
      .patch(`/reviews/${reviewId}`)
      .set(auth('other'))
      .send({ rating: 1 })
      .expect(403);

    const edited = await request(server)
      .patch(`/reviews/${reviewId}`)
      .set(auth('customer'))
      .send({ rating: 3 })
      .expect(200);
    expect(edited.body.editedAt).not.toBeNull();
    expect(await deviceRating()).toEqual({ avgRating: 3, reviewCount: 1 });
  });

  it('admin ẩn (bắt buộc lý do) → không tính điểm, không hiện công khai; hiện lại được', async () => {
    await request(server)
      .patch(`/reviews/${reviewId}/visibility`)
      .set(auth('customer'))
      .send({ hidden: true, reason: 'Tự ẩn' })
      .expect(403);
    await request(server)
      .patch(`/reviews/${reviewId}/visibility`)
      .set(auth('admin'))
      .send({ hidden: true })
      .expect(400);

    await request(server)
      .patch(`/reviews/${reviewId}/visibility`)
      .set(auth('admin'))
      .send({ hidden: true, reason: 'Nội dung không liên quan' })
      .expect(200);
    expect(await deviceRating()).toEqual({ avgRating: null, reviewCount: 0 });
    const list = await request(server)
      .get('/reviews')
      .query({ deviceId: ids.device })
      .expect(200);
    expect(list.body.meta.total).toBe(0);

    const adminList = await request(server)
      .get('/reviews/admin')
      .query({ hidden: 'true', search: `Review E2E Device ${stamp}` })
      .set(auth('admin'))
      .expect(200);
    expect(adminList.body.data[0]).toMatchObject({
      id: reviewId,
      isHidden: true,
      hiddenReason: 'Nội dung không liên quan',
    });

    await request(server)
      .patch(`/reviews/${reviewId}/visibility`)
      .set(auth('admin'))
      .send({ hidden: false })
      .expect(200);
    expect(await deviceRating()).toEqual({ avgRating: 3, reviewCount: 1 });
  });

  it('tài khoản trong danh sách đen không được đánh giá/sửa', async () => {
    await prisma.user.update({
      where: { id: ids.customer },
      data: { isBlacklisted: true },
    });
    await request(server)
      .patch(`/reviews/${reviewId}`)
      .set(auth('customer'))
      .send({ rating: 5 })
      .expect(403);
    await prisma.user.update({
      where: { id: ids.customer },
      data: { isBlacklisted: false },
    });
  });

  it('xoá đánh giá của mình → điểm thiết bị về trống', async () => {
    await request(server)
      .delete(`/reviews/${reviewId}`)
      .set(auth('other'))
      .expect(403);
    await request(server)
      .delete(`/reviews/${reviewId}`)
      .set(auth('customer'))
      .expect(204);
    expect(await deviceRating()).toEqual({ avgRating: null, reviewCount: 0 });
  });
});
