// Kịch bản (c): luồng hỗn hợp giống người dùng thật (toàn bộ là đọc, không cần đăng nhập):
// xem danh sách → xem chi tiết → kiểm tra lịch trống → xem chính sách thuê.
// Mỗi bước nghỉ 1–2 giây như người thật đọc trang. Tải tăng 10 → 50 → 100 → 200 VU.
//   k6 run -e NAME=mixed-flow mixed-flow.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import {
  BASE_URL,
  RAMP_STAGES,
  SUMMARY_TREND_STATS,
  currentLevel,
  fetchDeviceIds,
  levelThresholds,
  writeSummary,
} from './lib/common.js';

const NAME = __ENV.NAME || 'mixed-flow';
const STEPS = ['list', 'detail', 'availability', 'policies'];

function think() {
  sleep(1 + Math.random());
}

const stepThresholds = {};
for (const step of STEPS) {
  stepThresholds[`http_req_duration{step:${step}}`] = [step === 'list' ? 'avg<100' : 'avg<300'];
  stepThresholds[`http_req_failed{step:${step}}`] = ['rate<0.01'];
}

export const options = {
  scenarios: {
    ramp: { executor: 'ramping-vus', startVUs: 0, stages: RAMP_STAGES, gracefulRampDown: '5s' },
  },
  summaryTrendStats: SUMMARY_TREND_STATS,
  thresholds: {
    http_req_duration: ['avg<300'],
    http_req_failed: ['rate<0.01'],
    ...levelThresholds(300),
    ...stepThresholds,
  },
};

export function setup() {
  return { deviceIds: fetchDeviceIds(), startedAt: Date.now() };
}

export default function (data) {
  const level = currentLevel(data.startedAt);
  const id = data.deviceIds[Math.floor(Math.random() * data.deviceIds.length)];
  const tags = (step) => ({ tags: { level, step } });

  group('1. Danh sách', () => {
    const r = http.get(`${BASE_URL}/devices?page=1&limit=12`, tags('list'));
    check(r, { 'list 200': (x) => x.status === 200 });
  });
  think();

  group('2. Chi tiết', () => {
    const r = http.get(`${BASE_URL}/devices/${id}`, tags('detail'));
    check(r, { 'detail 200': (x) => x.status === 200 });
  });
  think();

  group('3. Lịch trống', () => {
    // Khung giờ ngẫu nhiên trong năm 2027 (luôn ở tương lai), thuê 1–3 ngày.
    const start = new Date(Date.UTC(2027, Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 27), 2));
    const end = new Date(start.getTime() + (1 + Math.floor(Math.random() * 3)) * 86400000);
    const r = http.get(
      `${BASE_URL}/bookings/availability?deviceId=${id}&startTime=${start.toISOString()}&endTime=${end.toISOString()}`,
      tags('availability'),
    );
    check(r, { 'availability 200': (x) => x.status === 200 });
  });
  think();

  group('4. Chính sách', () => {
    const r = http.get(`${BASE_URL}/policies/rental`, tags('policies'));
    check(r, { 'policies 200': (x) => x.status === 200 });
  });
  think();
}

export function handleSummary(data) {
  return writeSummary(NAME, data);
}
