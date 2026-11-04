import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BookingStatus, Role } from '../src/generated/prisma/client';
import {
  REVIEW_EDITS_PER_DAY,
  storeDayKey,
} from '../src/common/business-policy';

/**
 * Luật đánh giá v2 chạy trên Postgres thật: mọi khách đã đăng nhập đều đánh
 * giá được (không cần đã thuê), mỗi người đúng 1 đánh giá/thiết bị (kể cả 2
 * request đồng thời), nhãn "đã thuê" tính từ đơn completed và được ưu tiên,
 * staff/admin xoá mềm kèm lý do (người viết không viết lại được), admin khôi
 * phục, điểm trung bình của thiết bị luôn tính lại đúng.
 */
describe('Reviews (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const stamp = Date.now();
  const password = 'Str0ngP@ssword';
  type Key = 'renter' | 'other' | 'racer' | 'staff' | 'admin';
  const ids: Record<Key | 'category' | 'device', string> = {
    category: '',
    device: '',
    renter: '',
    other: '',
    racer: '',
    staff: '',
    admin: '',
  };
  const tokens: Record<Key, string> = {
    renter: '',
    other: '',
    racer: '',
    staff: '',
    admin: '',
  };
  let renterReviewId = '';
  let otherReviewId = '';

  async function createUser(key: Key, name: string, role: Role) {
    const email = `review-e2e-${key}-${stamp}@example.com`;
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role,
      },
    });
    ids[key] = user.id;
    const login = await request(server)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    tokens[key] = login.body.accessToken;
  }

  const auth = (key: Key) => ({ Authorization: `Bearer ${tokens[key]}` });
  const reviewsUrl = () => `/devices/${ids.device}/reviews`;

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

    await createUser('renter', 'Nguyễn Văn An', Role.customer);
    await createUser('other', 'Trần Thị Bình', Role.customer);
    await createUser('racer', 'Lê Văn Cường', Role.customer);
    await createUser('staff', 'Nhân Viên', Role.staff);
    await createUser('admin', 'Quản Trị Viên', Role.admin);

    // Chỉ "renter" có đơn đã trả máy với thiết bị.
    await prisma.booking.create({
      data: {
        userId: ids.renter,
        deviceId: ids.device,
        startTime: new Date('2026-03-01T02:00:00Z'),
        endTime: new Date('2026-03-03T02:00:00Z'),
        status: BookingStatus.completed,
        totalPrice: 160000,
        depositAmount: 10000000,
      },
    });
  }, 60000);

  afterAll(async () => {
    const userIds = [ids.renter, ids.other, ids.racer, ids.staff, ids.admin];
    await prisma.review.deleteMany({ where: { deviceId: ids.device } });
    await prisma.booking.deleteMany({ where: { deviceId: ids.device } });
    await prisma.notification.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.device.deleteMany({ where: { id: ids.device } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const comment = 'Máy chạy êm, pin trâu, giao nhận nhanh gọn.';

  it('khách CHƯA thuê vẫn đánh giá được; lần 2 bị 409', async () => {
    const created = await request(server)
      .post(reviewsUrl())
      .set(auth('other'))
      .send({ rating: 4, comment })
      .expect(201);
    otherReviewId = created.body.id;
    expect(created.body.bookingId).toBeNull();

    await request(server)
      .post(reviewsUrl())
      .set(auth('other'))
      .send({ rating: 2, comment })
      .expect(409);

    const me = await request(server)
      .get(`${reviewsUrl()}/me`)
      .set(auth('other'))
      .expect(200);
    expect(me.body).toMatchObject({
      canCreate: false,
      canEdit: true,
      review: { id: otherReviewId, verifiedRental: false },
    });
  });

  it('2 request đồng thời → chỉ 1 thành công, CSDL chỉ có 1 đánh giá', async () => {
    const results = await Promise.all(
      [5, 3].map((rating) =>
        request(server)
          .post(reviewsUrl())
          .set(auth('racer'))
          .send({ rating, comment }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.review.count({
        where: { userId: ids.racer, deviceId: ids.device },
      }),
    ).toBe(1);
  });

  it('chặn nhân viên/quản trị viên tự chấm điểm và nội dung spam', async () => {
    for (const key of ['staff', 'admin'] as const) {
      await request(server)
        .post(reviewsUrl())
        .set(auth(key))
        .send({ rating: 5, comment })
        .expect(403);
    }
    await request(server)
      .post(reviewsUrl())
      .set(auth('renter'))
      .send({ rating: 5, comment: 'Rẻ hơn ở www.abc.com' })
      .expect(400);
  });

  it('người đã thuê: nhãn "đã thuê", xếp trước trong sắp xếp mặc định, lọc riêng được', async () => {
    const created = await request(server)
      .post(reviewsUrl())
      .set(auth('renter'))
      .send({ rating: 5, comment })
      .expect(201);
    renterReviewId = created.body.id;

    const list = await request(server)
      .get('/reviews')
      .query({ deviceId: ids.device })
      .expect(200);
    expect(list.body.meta.total).toBe(3);
    // Viết sau cùng nhưng vẫn đứng đầu nhờ đã thuê.
    expect(list.body.data[0]).toMatchObject({
      id: renterReviewId,
      reviewerName: 'Nguyễn V. A',
      verifiedRental: true,
    });
    expect(
      list.body.data
        .slice(1)
        .every((r: { verifiedRental: boolean }) => !r.verifiedRental),
    ).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain(ids.renter);

    const rentedOnly = await request(server)
      .get('/reviews')
      .query({ deviceId: ids.device, rentedOnly: 'true' })
      .expect(200);
    expect(rentedOnly.body.data.map((r: { id: string }) => r.id)).toEqual([
      renterReviewId,
    ]);

    const summary = await request(server)
      .get('/reviews/summary')
      .query({ deviceId: ids.device })
      .expect(200);
    expect(summary.body).toMatchObject({ reviewCount: 3, rentedCount: 1 });
  });

  it('chỉ chủ được sửa; sửa tính lại điểm; quá giới hạn/ngày → 429', async () => {
    await request(server)
      .patch(`/reviews/${renterReviewId}`)
      .set(auth('other'))
      .send({ rating: 1 })
      .expect(403);

    const before = await deviceRating();
    await request(server)
      .patch(`/reviews/${otherReviewId}`)
      .set(auth('other'))
      .send({ rating: 1 })
      .expect(200);
    const after = await deviceRating();
    expect(after.reviewCount).toBe(3);
    expect(after.avgRating).toBeCloseTo((before.avgRating! * 3 - 3) / 3, 5);

    await prisma.review.update({
      where: { id: renterReviewId },
      data: {
        editDay: storeDayKey(new Date()),
        editCount: REVIEW_EDITS_PER_DAY,
      },
    });
    const limited = await request(server)
      .patch(`/reviews/${renterReviewId}`)
      .set(auth('renter'))
      .send({ rating: 4 })
      .expect(429);
    expect(limited.body.message).toContain(`${REVIEW_EDITS_PER_DAY} lần/ngày`);
  });

  it('tài khoản trong danh sách đen không được sửa', async () => {
    await prisma.user.update({
      where: { id: ids.other },
      data: { isBlacklisted: true },
    });
    await request(server)
      .patch(`/reviews/${otherReviewId}`)
      .set(auth('other'))
      .send({ rating: 5 })
      .expect(403);
    await prisma.user.update({
      where: { id: ids.other },
      data: { isBlacklisted: false },
    });
  });

  it('tự xoá đánh giá của mình → viết lại được (vẫn tối đa 1)', async () => {
    await request(server)
      .delete(`/reviews/${otherReviewId}`)
      .set(auth('renter'))
      .expect(403);
    await request(server)
      .delete(`/reviews/${otherReviewId}`)
      .set(auth('other'))
      .expect(204);
    expect((await deviceRating()).reviewCount).toBe(2);

    const again = await request(server)
      .post(reviewsUrl())
      .set(auth('other'))
      .send({ rating: 4, comment })
      .expect(201);
    otherReviewId = again.body.id;
    expect((await deviceRating()).reviewCount).toBe(3);
  });

  it('staff xoá mềm kèm lý do → người viết nhận thông báo, không viết lại được; admin khôi phục', async () => {
    await request(server)
      .post(`/reviews/${otherReviewId}/moderator-delete`)
      .set(auth('renter'))
      .send({ reason: 'Spam' })
      .expect(403);
    await request(server)
      .post(`/reviews/${otherReviewId}/moderator-delete`)
      .set(auth('staff'))
      .send({ reason: '  ' })
      .expect(400);

    await request(server)
      .post(`/reviews/${otherReviewId}/moderator-delete`)
      .set(auth('staff'))
      .send({ reason: 'Ngôn từ không phù hợp' })
      .expect(200);

    const stored = await prisma.review.findUniqueOrThrow({
      where: { id: otherReviewId },
    });
    expect(stored).toMatchObject({
      deletedById: ids.staff,
      deleteReason: 'Ngôn từ không phù hợp',
    });
    expect((await deviceRating()).reviewCount).toBe(2);
    const list = await request(server)
      .get('/reviews')
      .query({ deviceId: ids.device })
      .expect(200);
    expect(list.body.data.map((r: { id: string }) => r.id)).not.toContain(
      otherReviewId,
    );

    const notification = await prisma.notification.findFirst({
      where: { userId: ids.other, type: 'review_deleted' },
    });
    expect(notification?.message).toContain('Lý do: Ngôn từ không phù hợp');

    const me = await request(server)
      .get(`${reviewsUrl()}/me`)
      .set(auth('other'))
      .expect(200);
    expect(me.body).toMatchObject({
      canCreate: false,
      canEdit: false,
      reason: 'removed_by_moderator',
    });
    await request(server)
      .post(reviewsUrl())
      .set(auth('other'))
      .send({ rating: 5, comment })
      .expect(403);
    await request(server)
      .delete(`/reviews/${otherReviewId}`)
      .set(auth('other'))
      .expect(403);

    const deletedTab = await request(server)
      .get('/reviews/admin')
      .query({ status: 'deleted', search: `Review E2E Device ${stamp}` })
      .set(auth('admin'))
      .expect(200);
    expect(deletedTab.body.data[0]).toMatchObject({
      id: otherReviewId,
      deletedBy: { id: ids.staff, name: 'Nhân Viên' },
    });

    await request(server)
      .post(`/reviews/${otherReviewId}/restore`)
      .set(auth('staff'))
      .expect(403);
    await request(server)
      .post(`/reviews/${otherReviewId}/restore`)
      .set(auth('admin'))
      .expect(200);
    expect((await deviceRating()).reviewCount).toBe(3);
  });

  it('ẩn (bắt buộc lý do) → không tính điểm, không hiện công khai', async () => {
    await request(server)
      .patch(`/reviews/${renterReviewId}/visibility`)
      .set(auth('staff'))
      .send({ hidden: true })
      .expect(400);
    await request(server)
      .patch(`/reviews/${renterReviewId}/visibility`)
      .set(auth('staff'))
      .send({ hidden: true, reason: 'Nội dung không liên quan' })
      .expect(200);
    expect((await deviceRating()).reviewCount).toBe(2);
    const summary = await request(server)
      .get('/reviews/summary')
      .query({ deviceId: ids.device })
      .expect(200);
    expect(summary.body).toMatchObject({ reviewCount: 2, rentedCount: 0 });
  });
});
