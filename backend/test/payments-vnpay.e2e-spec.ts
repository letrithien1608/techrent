import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { BookingStatus } from '../src/generated/prisma/client';

/**
 * Test e2e THẬT gọi thẳng VNPay Sandbox (không mock) để xác nhận luồng tạo URL
 * thanh toán hoạt động đúng: `vnp_TmnCode`/`vnp_SecureHash` được VNPay chấp
 * nhận. KHÔNG test luồng callback/IPN thật (cần thao tác thủ công chọn ngân
 * hàng/nhập OTP trên UI VNPay — ngoài khả năng của test tự động).
 *
 * Cách xác nhận: gửi request HTTP thật tới URL do `PaymentsService` sinh ra,
 * không follow redirect. Đã kiểm chứng tay bằng curl trước khi viết test này:
 * - Chữ ký ĐÚNG -> VNPay trả 302, Location chứa `PaymentMethod.html` (chuyển
 *   sang màn hình chọn phương thức thanh toán)
 * - Chữ ký SAI -> VNPay trả 302, Location chứa `Payment/Error.html?code=70`
 *   (mã lỗi 70 = sai checksum)
 */
describe('Payments VNPay Sandbox (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let categoryId: string;
  let deviceId: string;
  let bookingId: string;
  let userToken: string;
  const userEmail = `vnpay-test-${Date.now()}@example.com`;

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
      data: { name: `VNPay Test Category ${Date.now()}` },
    });
    categoryId = category.id;

    const device = await prisma.device.create({
      data: {
        name: `VNPay Test Device ${Date.now()}`,
        categoryId,
        pricePerHour: 10000,
        pricePerDay: 80000,
      },
    });
    deviceId = device.id;

    const server = app.getHttpServer();
    await request(server)
      .post('/auth/register')
      .send({
        name: 'VNPay Tester',
        email: userEmail,
        password: 'Str0ngP@ssword',
      })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ email: userEmail, password: 'Str0ngP@ssword' })
      .expect(200);
    userToken = login.body.accessToken;

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: userEmail },
    });
    // Tạo booking trực tiếp qua Prisma (bỏ qua BookingsService/TTL job) — mục
    // tiêu test này CHỈ là luồng tạo URL thanh toán, không phải luồng đặt phòng.
    const booking = await prisma.booking.create({
      data: {
        userId: user.id,
        deviceId,
        startTime: new Date(Date.now() + 48 * 3600 * 1000),
        endTime: new Date(Date.now() + 50 * 3600 * 1000),
        status: BookingStatus.pending,
        totalPrice: 30000,
        depositAmount: 90000,
      },
    });
    bookingId = booking.id;
  }, 60000);

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { bookingId } });
    await prisma.booking.deleteMany({ where: { deviceId } });
    await prisma.device
      .delete({ where: { id: deviceId } })
      .catch(() => undefined);
    await prisma.category
      .delete({ where: { id: categoryId } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await app.close();
  }, 30000);

  it('tạo payment URL hợp lệ và VNPay Sandbox thật chấp nhận chữ ký (chuyển sang màn hình chọn phương thức thanh toán)', async () => {
    const server = app.getHttpServer();

    const createRes = await request(server)
      .post('/payments/vnpay/create')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ bookingId })
      .expect(201);

    const { paymentUrl } = createRes.body;
    expect(paymentUrl).toContain('sandbox.vnpayment.vn');
    expect(paymentUrl).toContain('vnp_SecureHash=');

    // Gọi THẬT tới VNPay Sandbox, không follow redirect để đọc thẳng Location
    const vnpayResponse = await fetch(paymentUrl, { redirect: 'manual' });
    expect(vnpayResponse.status).toBe(302);

    const location = vnpayResponse.headers.get('location') ?? '';
    expect(location).toContain('PaymentMethod.html');
    expect(location).not.toContain('Error.html');
  }, 20000);
});
