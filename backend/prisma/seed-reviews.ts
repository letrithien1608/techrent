/**
 * Đánh giá DEMO cho môi trường phát triển — KHÔNG phải đánh giá thật của khách.
 *
 * Tạo đúng theo luật của hệ thống: mỗi đánh giá gắn với 1 đơn thuê ĐÃ HOÀN TẤT
 * (đã trả máy) của 1 tài khoản khách demo, mỗi khách tối đa 1 đánh giá/thiết bị,
 * nội dung qua đúng bộ lọc chống spam. Mỗi thiết bị 0–6 đánh giá, có cả 2–4★.
 * Tài khoản demo: demo.review<N>@techrent.test (không có CCCD/eKYC nên không
 * đặt thuê thật được). Chạy lại idempotent.
 */
import * as bcrypt from 'bcrypt';
import {
  BookingStatus,
  PrismaClient,
  Role,
} from '../src/generated/prisma/client';
import { calculateDeposit } from '../src/common/business-policy';
import { sanitizeReviewComment } from '../src/reviews/review-content.util';

const REVIEWERS = [
  'Nguyễn Văn An',
  'Trần Thị Bình',
  'Lê Minh Châu',
  'Phạm Quốc Dũng',
  'Hoàng Thu Hà',
  'Vũ Đức Huy',
  'Đặng Ngọc Lan',
  'Bùi Thanh Nam',
  'Đỗ Mai Phương',
  'Ngô Gia Bảo',
];

const COMMENTS: Record<number, string[]> = {
  5: [
    'Máy mới, sạch sẽ, chạy mượt suốt thời gian thuê. Nhân viên hướng dẫn kỹ lúc nhận máy.',
    'Đặt online nhanh, nhận máy đúng giờ hẹn. Thiết bị đúng như mô tả, lần sau sẽ thuê lại.',
    'Thuê cho chuyến công tác 3 ngày, máy hoạt động ổn định, phụ kiện đi kèm đầy đủ.',
    'Giá thuê hợp lý, được dùng thử trước khi quyết định mua nên rất đáng.',
    'Thủ tục nhận và trả máy gọn gàng, tiền cọc hoàn lại nhanh. Rất hài lòng.',
    'Tình trạng máy gần như mới, không trầy xước. Hỗ trợ qua điện thoại nhiệt tình.',
    'Dùng cho sự kiện cuối tuần, mọi thứ trơn tru, không gặp lỗi nào.',
  ],
  4: [
    'Máy chạy tốt, chỉ có hộp đựng hơi cũ. Nhìn chung đáng tiền.',
    'Thiết bị ổn, giao đúng hẹn. Mong cửa hàng có thêm khung giờ nhận máy buổi tối.',
    'Chất lượng tốt, pin dùng được lâu. Phần hướng dẫn sử dụng có thể chi tiết hơn.',
    'Đúng mô tả, hoạt động ổn định. Phải chờ khoảng 15 phút lúc nhận máy.',
    'Dùng 2 ngày không có vấn đề gì, chỉ tiếc là không kèm túi chống sốc.',
  ],
  3: [
    'Máy dùng được nhưng có vài vết xước ngoài vỏ, pin tụt nhanh hơn mong đợi.',
    'Thiết bị ổn nhưng thủ tục nhận máy hơi lâu do phải kiểm tra nhiều bước.',
    'Chất lượng tạm được, thiếu 1 dây cáp nên phải tự chuẩn bị thêm.',
  ],
  2: [
    'Máy bị nóng khi dùng lâu, đã báo nhân viên và được hỗ trợ nhưng mất khá nhiều thời gian.',
  ],
};

// Số sao lần lượt cho các đánh giá của 1 thiết bị — đa số 4–5★, xen 2–3★.
const RATING_CYCLE = [5, 4, 5, 3, 5, 4, 2, 5, 4, 3, 5, 5];
const DEMO_PASSWORD = 'Matkhau123';
const DAY = 24 * 60 * 60 * 1000;
const FIRST_RENTAL = new Date('2026-02-02T02:00:00.000Z');

/** Số đánh giá demo 0..6 cố định theo tên thiết bị (chạy lại ra đúng số cũ). */
function reviewCountFor(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % 7;
}

async function ensureReviewers(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users: { id: string }[] = [];
  for (const [index, name] of REVIEWERS.entries()) {
    const email = `demo.review${index + 1}@techrent.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        name,
        email,
        passwordHash,
        role: Role.customer,
        phone: `09990000${String(index + 1).padStart(2, '0')}`,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    users.push(user);
  }
  return users;
}

export async function seedDemoReviews(prisma: PrismaClient): Promise<void> {
  console.log(
    '💬 Đánh giá demo (dữ liệu phát triển, không phải đánh giá thật)',
  );
  const reviewers = await ensureReviewers(prisma);
  const devices = await prisma.device.findMany({
    where: { isDiscontinued: false },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      pricePerDay: true,
      originalPrice: true,
    },
  });

  let created = 0;
  let commentIndex = 0;
  for (const [deviceIndex, device] of devices.entries()) {
    const count = reviewCountFor(device.name);
    for (let j = 0; j < count; j++) {
      const user = reviewers[(deviceIndex + j * 3) % reviewers.length];
      const exists = await prisma.review.findUnique({
        where: { userId_deviceId: { userId: user.id, deviceId: device.id } },
      });
      if (exists) continue;

      const rating = RATING_CYCLE[(deviceIndex + j) % RATING_CYCLE.length];
      const pool = COMMENTS[rating];
      const comment = sanitizeReviewComment(pool[commentIndex++ % pool.length]);
      // Đơn thuê 2 ngày trong quá khứ, cách nhau 20 ngày — đã trả máy (completed).
      const startTime = new Date(
        FIRST_RENTAL.getTime() + (deviceIndex + j * 20) * DAY,
      );
      const endTime = new Date(startTime.getTime() + 2 * DAY);

      await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            userId: user.id,
            deviceId: device.id,
            startTime,
            endTime,
            status: BookingStatus.completed,
            totalPrice: Number(device.pricePerDay) * 2,
            depositAmount: calculateDeposit(Number(device.originalPrice)),
            createdAt: new Date(startTime.getTime() - DAY),
          },
        });
        await tx.review.create({
          data: {
            bookingId: booking.id,
            userId: user.id,
            deviceId: device.id,
            rating,
            comment,
            createdAt: new Date(endTime.getTime() + DAY / 2),
          },
        });
      });
      created++;
    }

    const stats = await prisma.review.aggregate({
      where: { deviceId: device.id, isHidden: false },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await prisma.device.update({
      where: { id: device.id },
      data: {
        avgRating: stats._avg.rating,
        reviewCount: stats._count.rating,
      },
    });
  }

  const total = await prisma.review.count();
  console.log(
    `  ✅ Tạo mới ${created} đánh giá demo — tổng ${total} đánh giá\n`,
  );
}
