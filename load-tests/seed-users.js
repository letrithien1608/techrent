// Tạo N tài khoản khách hàng TEST đã đủ điều kiện đặt thuê (CCCD + 3 ảnh eKYC)
// cho kịch bản đặt thuê đồng thời (d). Ghi thẳng vào Postgres, KHÔNG đi qua API
// (để không upload ảnh thật lên Cloudinary). Ảnh eKYC là public_id GIẢ — đủ để qua
// kiểm tra "đã nộp đủ 3 ảnh" của BookingsService.create(), không bao giờ được xem.
//   node load-tests/seed-users.js [số lượng, mặc định 100]
// Email: loadtest.<n>@techrent.test / mật khẩu Loadtest123 — dọn bằng cleanup.js.
const path = require('path');
const crypto = require('crypto');
const backend = path.join(__dirname, '..', 'backend');
const req = (m) => require(require.resolve(m, { paths: [backend] }));
req('dotenv').config({ path: path.join(backend, '.env') });
const { Client } = req('pg');
const bcrypt = req('bcrypt');

const COUNT = Number(process.argv[2] || 100);
const PASSWORD = 'Loadtest123';

async function main() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const hash = await bcrypt.hash(PASSWORD, 10);
  let created = 0;
  for (let i = 1; i <= COUNT; i++) {
    const n = String(i).padStart(4, '0');
    const cccd = `0999${String(i).padStart(8, '0')}`; // 12 số, dải riêng cho test
    const res = await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, phone, created_at,
         email_verified_at, cccd_hash, cccd_masked,
         kyc_cccd_front_public_id, kyc_cccd_back_public_id, kyc_selfie_public_id)
       VALUES ($1,$2,$3,$4,'customer',$5,now(),now(),$6,$7,$8,$9,$10)
       ON CONFLICT (email) DO NOTHING`,
      [
        crypto.randomUUID(),
        `Load Test ${n}`,
        `loadtest.${n}@techrent.test`,
        hash,
        `0998${String(i).padStart(6, '0')}`,
        crypto.createHash('sha256').update(`loadtest:${cccd}`).digest('hex'),
        `********${cccd.slice(-4)}`,
        `loadtest/fake-front-${n}`,
        `loadtest/fake-back-${n}`,
        `loadtest/fake-selfie-${n}`,
      ],
    );
    created += res.rowCount;
  }
  console.log(`Đã tạo ${created}/${COUNT} tài khoản test (mật khẩu ${PASSWORD}).`);
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
