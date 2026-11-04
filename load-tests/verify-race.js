// Kiểm tra database sau kịch bản đặt thuê đồng thời (d):
// mỗi khung giờ chỉ có ĐÚNG 1 đơn còn hiệu lực, và không có 2 đơn nào chồng lịch.
//   node load-tests/verify-race.js
const path = require('path');
const backend = path.join(__dirname, '..', 'backend');
const req = (m) => require(require.resolve(m, { paths: [backend] }));
req('dotenv').config({ path: path.join(backend, '.env') });
const { Client } = req('pg');

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const perSlot = await db.query(
    `SELECT b.device_id, b.start_time, b.end_time, b.status, count(*)::int AS n
       FROM bookings b JOIN users u ON u.id = b.user_id
      WHERE u.email LIKE 'loadtest.%@techrent.test'
      GROUP BY 1,2,3,4 ORDER BY 2`,
  );
  console.table(perSlot.rows.map((r) => ({ ...r, start_time: r.start_time.toISOString(), end_time: r.end_time.toISOString() })));
  const overlap = await db.query(
    `SELECT count(*)::int AS n FROM bookings a JOIN bookings b
        ON a.device_id = b.device_id AND a.id < b.id
       AND a.status NOT IN ('cancelled') AND b.status NOT IN ('cancelled')
       AND tsrange(a.start_time, a.end_time) && tsrange(b.start_time, b.end_time)`,
  );
  console.log(`Số cặp đơn chồng lịch trên CÙNG thiết bị (toàn bộ database): ${overlap.rows[0].n}`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
