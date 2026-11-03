import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadService } from '../src/upload/upload.service';
import {
  BookingStatus,
  DeviceStatus,
  Role,
} from '../src/generated/prisma/client';

/**
 * Đổi máy khi khách báo lỗi giữa kỳ thuê, chạy trên Postgres thật (không mock
 * Prisma): 2 yêu cầu đổi máy ĐỒNG THỜI sang cùng 1 máy trống chỉ 1 thành công
 * (transaction + SELECT FOR UPDATE + exclusion constraint), và không đổi được
 * sang máy đã có lịch trùng.
 */
describe('Đổi máy khi báo lỗi (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const stamp = Date.now();
  const password = 'Str0ngP@ssword';
  const DAY = 24 * 3600 * 1000;
  const ids: Record<string, string> = {};
  let adminToken = '';

  async function createUser(key: string, role: Role) {
    const email = `swap-e2e-${key}-${stamp}@example.com`;
    const user = await prisma.user.create({
      data: {
        name: `Swap ${key}`,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role,
      },
    });
    ids[key] = user.id;
    return email;
  }

  async function createDevice(key: string, status: DeviceStatus) {
    const device = await prisma.device.create({
      data: {
        name: `Swap E2E ${key} ${stamp}`,
        categoryId: ids.category,
        status,
        pricePerHour: 50000,
        pricePerDay: 300000,
        originalPrice: 20000000,
        images: [],
      },
    });
    ids[key] = device.id;
  }

  async function ongoingBookingWithReport(key: string, deviceKey: string) {
    const booking = await prisma.booking.create({
      data: {
        userId: ids.customer,
        deviceId: ids[deviceKey],
        startTime: new Date(Date.now() - DAY),
        endTime: new Date(Date.now() + 3 * DAY),
        status: BookingStatus.ongoing,
        totalPrice: 1200000,
        depositAmount: 10000000,
        rentalPaid: true,
        contractSigned: true,
      },
    });
    ids[key] = booking.id;
    const report = await prisma.deviceIssueReport.create({
      data: {
        bookingId: booking.id,
        reportedById: ids.customer,
        deviceId: ids[deviceKey],
        description: 'Máy không lên nguồn',
        media: [],
      },
    });
    ids[`${key}Report`] = report.id;
  }

  const swap = (reportKey: string, deviceKey: string) =>
    request(server)
      .post(`/issue-reports/${ids[reportKey]}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('resolution', 'swapped')
      .field('replacementDeviceId', ids[deviceKey])
      .attach('images', Buffer.from('a'), 'a.jpg')
      .attach('images', Buffer.from('b'), 'b.jpg')
      .attach('images', Buffer.from('c'), 'c.jpg');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Không đẩy ảnh test lên Cloudinary thật.
      .overrideProvider(UploadService)
      .useValue({
        uploadInspectionImages: async (files: unknown[]) =>
          files.map((_, i) => `https://example.com/swap-${i}.jpg`),
      })
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
    prisma = moduleFixture.get(PrismaService);

    const category = await prisma.category.create({
      data: { name: `Swap E2E ${stamp}` },
    });
    ids.category = category.id;
    await createUser('customer', Role.customer);
    await createUser('other', Role.customer);
    const adminEmail = await createUser('admin', Role.admin);
    adminToken = (
      await request(server)
        .post('/auth/login')
        .send({ email: adminEmail, password })
        .expect(200)
    ).body.accessToken;

    await createDevice('old1', DeviceStatus.rented);
    await createDevice('old2', DeviceStatus.rented);
    await createDevice('spare', DeviceStatus.available);
    await createDevice('busy', DeviceStatus.available);
    await ongoingBookingWithReport('b1', 'old1');
    await ongoingBookingWithReport('b2', 'old2');

    // Máy "busy" đã có khách khác đặt trùng thời gian thuê.
    await prisma.booking.create({
      data: {
        userId: ids.other,
        deviceId: ids.busy,
        startTime: new Date(Date.now() + DAY),
        endTime: new Date(Date.now() + 2 * DAY),
        status: BookingStatus.confirmed,
        totalPrice: 300000,
        depositAmount: 10000000,
      },
    });
  }, 60000);

  afterAll(async () => {
    const deviceIds = ['old1', 'old2', 'spare', 'busy'].map((k) => ids[k]);
    const bookings = await prisma.booking.findMany({
      where: { deviceId: { in: deviceIds } },
      select: { id: true },
    });
    const bookingIds = bookings.map((b) => b.id);
    await prisma.notification.deleteMany({
      where: { userId: { in: [ids.customer, ids.other, ids.admin] } },
    });
    await prisma.deviceIssueReport.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.bookingInspection.deleteMany({
      where: { bookingId: { in: bookingIds } },
    });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.maintenance.deleteMany({
      where: { deviceId: { in: deviceIds } },
    });
    await prisma.device.deleteMany({ where: { id: { in: deviceIds } } });
    await prisma.category.delete({ where: { id: ids.category } });
    await prisma.user.deleteMany({
      where: { id: { in: [ids.customer, ids.other, ids.admin] } },
    });
    await app.close();
  });

  it('không đổi được sang máy đã có lịch trùng trong thời gian thuê', async () => {
    const res = await swap('b1Report', 'busy');
    expect(res.status).toBe(409);
    const b1 = await prisma.booking.findUniqueOrThrow({
      where: { id: ids.b1 },
    });
    expect(b1.deviceId).toBe(ids.old1);
  });

  it('2 yêu cầu đổi máy cùng lúc sang cùng 1 máy trống: đúng 1 thành công', async () => {
    const [r1, r2] = await Promise.all([
      swap('b1Report', 'spare'),
      swap('b2Report', 'spare'),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(201);
    expect([400, 409]).toContain(statuses[1]);

    const activeOnSpare = await prisma.booking.count({
      where: {
        deviceId: ids.spare,
        status: {
          in: [
            BookingStatus.pending,
            BookingStatus.confirmed,
            BookingStatus.ongoing,
          ],
        },
      },
    });
    expect(activeOnSpare).toBe(1);
    const spare = await prisma.device.findUniqueOrThrow({
      where: { id: ids.spare },
    });
    expect(spare.status).toBe(DeviceStatus.rented);
  });
});
