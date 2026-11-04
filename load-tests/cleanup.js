// Dọn sạch dữ liệu do kiểm thử tải tạo ra:
//   - đơn thuê của tài khoản loadtest.* (+ thanh toán, thông báo gửi cho nhân viên về các đơn đó)
//   - job TTL BullMQ (queue booking-ttl, jobId = id đơn)
//   - tài khoản loadtest.*@techrent.test
//   - cache danh sách thiết bị trên Redis (devices:list:*)
//   node load-tests/cleanup.js
const path = require('path');
const backend = path.join(__dirname, '..', 'backend');
const req = (m) => require(require.resolve(m, { paths: [backend] }));
req('dotenv').config({ path: path.join(backend, '.env') });
const { Client } = req('pg');
const { Queue } = req('bullmq');
const IORedis = req('ioredis');

const EMAIL_PATTERN = 'loadtest.%@techrent.test';

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const users = (await db.query('SELECT id FROM users WHERE email LIKE $1', [EMAIL_PATTERN])).rows.map((r) => r.id);
  const bookings = users.length
    ? (await db.query('SELECT id FROM bookings WHERE user_id = ANY($1)', [users])).rows.map((r) => r.id)
    : [];

  const redis = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('booking-ttl', { connection: redis });
  let jobs = 0;
  for (const id of bookings) {
    const job = await queue.getJob(id);
    if (job) {
      await job.remove();
      jobs++;
    }
  }

  await db.query('BEGIN');
  const notif = await db.query(
    `DELETE FROM notifications WHERE user_id = ANY($1) OR metadata->>'bookingId' = ANY($2)`,
    [users, bookings],
  );
  const pay = await db.query('DELETE FROM payments WHERE booking_id = ANY($1)', [bookings]);
  const bk = await db.query('DELETE FROM bookings WHERE id = ANY($1)', [bookings]);
  const us = await db.query('DELETE FROM users WHERE id = ANY($1)', [users]);
  await db.query('COMMIT');

  const keys = await redis.keys('devices:list:*');
  if (keys.length) await redis.del(...keys);

  console.log(
    `Đã xoá: ${us.rowCount} tài khoản, ${bk.rowCount} đơn, ${pay.rowCount} thanh toán, ` +
      `${notif.rowCount} thông báo, ${jobs} job TTL, ${keys.length} key cache.`,
  );
  await queue.close();
  await redis.quit();
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
