// Dùng chung cho các kịch bản k6 trong load-tests/.
import http from 'k6/http';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// 4 mức tải theo yêu cầu: 10 → 50 → 100 → 200 người dùng ảo, mỗi mức 1 phút
// (5 giây tăng dần + 55 giây giữ ổn định).
export const LEVELS = [10, 50, 100, 200];
export const LEVEL_SECONDS = 60;
export const RAMP_STAGES = LEVELS.flatMap((target) => [
  { duration: '5s', target },
  { duration: `${LEVEL_SECONDS - 5}s`, target },
]);

export const SUMMARY_TREND_STATS = ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'];

/** Mức tải hiện tại suy ra từ thời gian đã chạy (dùng gắn tag `level` cho từng request). */
export function currentLevel(startedAtMs) {
  const idx = Math.floor((Date.now() - startedAtMs) / (LEVEL_SECONDS * 1000));
  return String(LEVELS[Math.min(idx, LEVELS.length - 1)]);
}

/**
 * Threshold cho từng mức tải — k6 chỉ đưa sub-metric (theo tag) vào summary
 * khi có threshold khai báo cho nó. Ngưỡng = mục tiêu mục 9 Roadmap.
 */
export function levelThresholds(avgTargetMs, extraTag = '') {
  const t = {};
  for (const level of LEVELS) {
    const sel = `level:${level}${extraTag}`;
    t[`http_req_duration{${sel}}`] = [`avg<${avgTargetMs}`];
    t[`http_req_failed{${sel}}`] = ['rate<0.01'];
    t[`http_reqs{${sel}}`] = ['count>0'];
  }
  return t;
}

/** Lấy danh sách id thiết bị đang cho thuê (gọi trong setup()). */
export function fetchDeviceIds() {
  const res = http.get(`${BASE_URL}/devices?page=1&limit=100`);
  if (res.status !== 200) throw new Error(`GET /devices lỗi ${res.status}`);
  return res.json('data').map((d) => d.id);
}

/** Ghi summary JSON đầy đủ + in vài dòng tóm tắt ra màn hình. */
export function writeSummary(name, data) {
  const m = data.metrics;
  const d = m.http_req_duration && m.http_req_duration.values;
  const lines = [
    `== ${name} ==`,
    `requests: ${m.http_reqs.values.count} (${m.http_reqs.values.rate.toFixed(1)} req/s)`,
    d ? `duration avg ${d.avg.toFixed(1)} ms | p95 ${d['p(95)'].toFixed(1)} | p99 ${d['p(99)'].toFixed(1)} | max ${d.max.toFixed(1)}` : '',
    `failed rate: ${(m.http_req_failed.values.rate * 100).toFixed(2)}%`,
    '',
  ];
  return {
    stdout: lines.join('\n'),
    [`../docs/load-test/${name}-summary.json`]: JSON.stringify(data, null, 2),
  };
}
