// Kịch bản (d): đặt thuê đồng thời. N tài khoản test (seed-users.js, đã đủ eKYC)
// cùng bấm "Đặt thuê" CÙNG 1 thiết bị, CÙNG 1 khung giờ, cùng 1 thời điểm.
// Lặp ROUNDS vòng, mỗi vòng 1 khung giờ khác nhau (cách nhau 10 giây).
// Kỳ vọng mỗi vòng: đúng 1 request 201, còn lại 409, không có lỗi 5xx.
//   k6 run -e USERS=100 -e ROUNDS=5 -e NAME=booking-race booking-race.js
// Kiểm tra database sau khi chạy: xem load-tests/verify-race.js.
import http from 'k6/http';
import exec from 'k6/execution';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, SUMMARY_TREND_STATS, writeSummary } from './lib/common.js';

// 409 (bị đơn khác giành trước) là kết quả ĐÚNG ở kịch bản này — không tính là lỗi.
http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const USERS = Number(__ENV.USERS || 100);
const ROUNDS = Number(__ENV.ROUNDS || 5);
const NAME = __ENV.NAME || 'booking-race';

const created = new Counter('booking_201');
const conflicts = new Counter('booking_409');
const others = new Counter('booking_other_status');

const scenarios = {};
const thresholds = {
  booking_other_status: ['count==0'],
  booking_201: [`count==${ROUNDS}`],
  booking_409: [`count==${ROUNDS * (USERS - 1)}`],
  http_req_duration: ['avg<300'],
  'http_req_duration{name:POST /bookings}': ['avg<300'],
  'http_req_failed{name:POST /bookings}': ['rate<0.01'],
};
for (let r = 0; r < ROUNDS; r++) {
  scenarios[`round${r}`] = {
    executor: 'per-vu-iterations',
    vus: USERS,
    iterations: 1,
    startTime: `${r * 10}s`,
    maxDuration: '30s',
    env: { ROUND: String(r) },
    tags: { round: String(r) },
  };
  thresholds[`booking_201{round:${r}}`] = ['count==1'];
  thresholds[`http_req_duration{round:${r},name:POST /bookings}`] = ['avg<300'];
}

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: SUMMARY_TREND_STATS,
  // Đăng nhập 100 tài khoản (bcrypt) trong setup có thể mất vài chục giây.
  setupTimeout: '180s',
};

/** Khung giờ của vòng r: năm 2028 (chắc chắn trống), mỗi vòng 1 ngày khác nhau. */
function slot(base, r) {
  const start = new Date(base + r * 3 * 86400000);
  const end = new Date(start.getTime() + 86400000);
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}

export function setup() {
  const list = http.get(`${BASE_URL}/devices?page=1&limit=1&status=available&sort=price_asc`);
  const deviceId = list.json('data')[0].id;
  // Ngày gốc cố định theo lần chạy (tránh trùng đơn của lần chạy trước nếu chưa dọn).
  const base = Date.UTC(2028, 0, 3, 2) + (Math.floor(Date.now() / 1000) % 300) * 86400000;

  for (let r = 0; r < ROUNDS; r++) {
    const s = slot(base, r);
    const a = http.get(`${BASE_URL}/bookings/availability?deviceId=${deviceId}&startTime=${s.startTime}&endTime=${s.endTime}`);
    if (!a.json('available')) throw new Error(`Khung giờ vòng ${r} đã có đơn — chạy cleanup.js trước`);
  }

  const tokens = [];
  for (let i = 1; i <= USERS; i++) {
    const email = `loadtest.${String(i).padStart(4, '0')}@techrent.test`;
    const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email, password: 'Loadtest123' }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'setup login' },
    });
    if (res.status !== 200 && res.status !== 201) throw new Error(`Đăng nhập ${email} lỗi ${res.status}`);
    tokens.push(res.json('accessToken'));
  }
  return { deviceId, base, tokens };
}

export default function (data) {
  const r = Number(__ENV.ROUND);
  // iterationInTest của mỗi scenario chạy 0..USERS-1 → mỗi VU dùng 1 tài khoản khác nhau.
  const token = data.tokens[exec.scenario.iterationInTest];
  const s = slot(data.base, r);
  const res = http.post(
    `${BASE_URL}/bookings`,
    JSON.stringify({ deviceId: data.deviceId, ...s }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, tags: { name: 'POST /bookings' } },
  );
  if (res.status === 201) created.add(1);
  else if (res.status === 409) conflicts.add(1);
  else {
    others.add(1);
    console.error(`Vòng ${r}: status ${res.status} ${res.body}`);
  }
  check(res, { '201 hoặc 409': (x) => x.status === 201 || x.status === 409 });
}

export function teardown(data) {
  console.log(`deviceId=${data.deviceId} base=${new Date(data.base).toISOString()} rounds=${ROUNDS}`);
}

export function handleSummary(data) {
  return writeSummary(NAME, data);
}
