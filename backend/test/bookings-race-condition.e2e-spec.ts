import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Test case BẮT BUỘC theo mục 5 Roadmap: 2 khách hàng cùng lúc bấm đặt CÙNG 1
 * thiết bị, CÙNG khung giờ — chỉ 1 request được xác nhận (201), request còn lại
 * phải bị từ chối ngay (409) nhờ Cơ chế 1 (transaction + SELECT ... FOR UPDATE).
 *
 * Đây là e2e test (không mock Prisma) vì mục đích là kiểm tra hành vi khoá dòng
 * (row-level lock) THẬT của Postgres dưới tải đồng thời — không thể giả lập
 * đúng bằng unit test với Prisma mock (mock luôn chạy tuần tự, không có race
 * condition thật).
 */
describe('Bookings race condition (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let categoryId: string;
  let deviceId: string;
  let userAToken: string;
  let userBToken: string;
  const userAEmail = `race-test-a-${Date.now()}@example.com`;
  const userBEmail = `race-test-b-${Date.now()}@example.com`;

  const startTime = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  const endTime = new Date(Date.now() + 74 * 3600 * 1000).toISOString();

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

    prisma = moduleFixture.get(PrismaService);

    const category = await prisma.category.create({
      data: { name: `Race Test Category ${Date.now()}` },
    });
    categoryId = category.id;

    const device = await prisma.device.create({
      data: {
        name: `Race Test Device ${Date.now()}`,
        categoryId,
        pricePerHour: 10000,
        pricePerDay: 80000,
      },
    });
    deviceId = device.id;

    const server = app.getHttpServer();
    for (const [email, password] of [
      [userAEmail, 'Str0ngP@ssword'],
      [userBEmail, 'Str0ngP@ssword'],
    ]) {
      await request(server)
        .post('/auth/register')
        .send({ name: 'Race Tester', email, password })
        .expect(201);
    }

    const loginA = await request(server)
      .post('/auth/login')
      .send({ email: userAEmail, password: 'Str0ngP@ssword' })
      .expect(200);
    userAToken = loginA.body.accessToken;

    const loginB = await request(server)
      .post('/auth/login')
      .send({ email: userBEmail, password: 'Str0ngP@ssword' })
      .expect(200);
    userBToken = loginB.body.accessToken;
  }, 60000);

  afterAll(async () => {
    await prisma.booking.deleteMany({ where: { deviceId } });
    await prisma.device
      .delete({ where: { id: deviceId } })
      .catch(() => undefined);
    await prisma.category
      .delete({ where: { id: categoryId } })
      .catch(() => undefined);
    await prisma.user.deleteMany({
      where: { email: { in: [userAEmail, userBEmail] } },
    });
    await app.close();
  }, 30000);

  it('chỉ 1 trong 2 request đặt trùng thiết bị/khung giờ cùng lúc thành công, request còn lại bị từ chối 409', async () => {
    const server = app.getHttpServer();
    const payload = { deviceId, startTime, endTime };

    const [responseA, responseB] = await Promise.all([
      request(server)
        .post('/bookings')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(payload),
      request(server)
        .post('/bookings')
        .set('Authorization', `Bearer ${userBToken}`)
        .send(payload),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const successResponse = responseA.status === 201 ? responseA : responseB;
    const failureResponse = responseA.status === 201 ? responseB : responseA;

    expect(successResponse.body.status).toBe('pending');
    expect(failureResponse.body.message).toContain('đã được đặt');

    // Xác nhận trong DB CHỈ có đúng 1 booking active cho khung giờ này — không
    // phải cả 2 request đều lọt qua rồi mới bị dọn dẹp sau.
    const bookingsInDb = await prisma.booking.findMany({ where: { deviceId } });
    expect(bookingsInDb).toHaveLength(1);
  }, 30000);
});
