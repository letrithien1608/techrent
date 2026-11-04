// Kịch bản (a)/(b): GET /devices (danh sách) hoặc GET /devices/:id (chi tiết),
// tăng dần 10 → 50 → 100 → 200 người dùng ảo, mỗi mức 1 phút.
//   k6 run -e TARGET=list   -e NAME=devices-list-cache   devices-ramp.js
//   k6 run -e TARGET=detail -e NAME=devices-detail       devices-ramp.js
//   k6 run -e TARGET=list -e SLEEP=0 -e NAME=...         devices-ramp.js   (stress)
// (b) chạy lại TARGET=list khi backend bật DEVICES_CACHE_DISABLED=true.
import http from 'k6/http';
import { check, sleep } from 'k6';
import {
  BASE_URL,
  RAMP_STAGES,
  SUMMARY_TREND_STATS,
  currentLevel,
  fetchDeviceIds,
  levelThresholds,
  writeSummary,
} from './lib/common.js';

const TARGET = __ENV.TARGET || 'list';
const NAME = __ENV.NAME || `devices-${TARGET}`;
const SLEEP = Number(__ENV.SLEEP ?? 0.5);
// Danh sách: mục tiêu < 100 ms (có cache); chi tiết: mục tiêu API chung < 300 ms.
const AVG_TARGET = TARGET === 'list' ? 100 : 300;

// Các tổ hợp filter giống trang /devices thật (trang 1, sắp xếp, lọc còn hàng).
const LIST_QUERIES = [
  'page=1&limit=12',
  'page=1&limit=12&sort=price_asc',
  'page=1&limit=12&status=available',
  'page=2&limit=12',
];

export const options = {
  scenarios: {
    ramp: { executor: 'ramping-vus', startVUs: 0, stages: RAMP_STAGES, gracefulRampDown: '5s' },
  },
  summaryTrendStats: SUMMARY_TREND_STATS,
  thresholds: {
    http_req_duration: [`avg<${AVG_TARGET}`],
    http_req_failed: ['rate<0.01'],
    ...levelThresholds(AVG_TARGET),
  },
};

export function setup() {
  return { deviceIds: fetchDeviceIds(), startedAt: Date.now() };
}

export default function (data) {
  const level = currentLevel(data.startedAt);
  let res;
  if (TARGET === 'list') {
    const q = LIST_QUERIES[Math.floor(Math.random() * LIST_QUERIES.length)];
    res = http.get(`${BASE_URL}/devices?${q}`, { tags: { level, name: 'GET /devices' } });
  } else {
    const id = data.deviceIds[Math.floor(Math.random() * data.deviceIds.length)];
    res = http.get(`${BASE_URL}/devices/${id}`, { tags: { level, name: 'GET /devices/:id' } });
  }
  check(res, { 'status 200': (r) => r.status === 200 });
  // Mặc định nghỉ 0,5 giây giữa 2 lượt (người dùng bấm liên tục) — 200 VU ≈ tối đa
  // ~400 req/s. SLEEP=0: bài stress, bắn liên tục để tìm thông lượng tối đa.
  if (SLEEP > 0) sleep(SLEEP);
}

export function handleSummary(data) {
  return writeSummary(NAME, data);
}
