# Kết quả kiểm thử tải (k6) — TechRent backend

> Ngày chạy: 04/11/2026. Công cụ: **k6 v2.3.0**. Script: `load-tests/`. Số liệu gốc (summary JSON của k6): `docs/load-test/*-summary.json`. Biểu đồ: `docs/load-test/*.png`.
> Mục tiêu đối chiếu: mục 9 `TechRent-Roadmap.md` (Non-functional Requirements).

## 1. Tóm tắt

| Mục tiêu (mục 9 Roadmap) | Kết quả đo | Đánh giá |
|---|---|---|
| Thời gian phản hồi API trung bình < 300 ms | Đọc dữ liệu: 2,4–23,3 ms ở mọi mức tải tới 200 người dùng ảo. Đặt thuê khi 100 người tranh **cùng 1 máy cùng 1 khung giờ**: 397 ms | **Đạt** với tải thực tế. Không đạt trong tình huống tranh chấp cực đoan (giải thích ở mục 4.4) |
| Danh sách thiết bị có cache Redis < 100 ms | TB 3,3 ms (p95 10 ms, p99 29 ms); bài stress không nghỉ: < 100 ms tới 100 người dùng ảo | **Đạt** |
| Chịu được ≥ 100 request/giây | 388 req/s ở 200 người dùng (có nghỉ 0,5 s); tối đa **~1.205 req/s** khi bắn liên tục (có cache) | **Đạt** (gấp ~12 lần mục tiêu) |
| Tỷ lệ lỗi < 1% | 0,00% ở mọi kịch bản thường; 0,04% ở bài stress có cache (0,16% riêng mức 200 người dùng) | **Đạt** |
| Không đặt trùng thiết bị | 5 vòng × 100 người: đúng 5 đơn thành công, 495 lần nhận 409, database 0 cặp đơn chồng lịch | **Đạt** |

## 2. Môi trường chạy

| Hạng mục | Cấu hình |
|---|---|
| Máy | ASUS TUF Gaming A15 FA507RC (laptop) |
| CPU | AMD Ryzen 7 6800H — 8 nhân / 16 luồng |
| RAM | 23,2 GB (trống ~9,9 GB lúc chạy) |
| Ổ cứng | SSD NVMe Kingston SNV3S 1 TB |
| Hệ điều hành | Windows 11 Home 10.0.26300 |
| Node.js | v20.19.0 |
| PostgreSQL 16 + Redis 7 | Docker Desktop 29.8.0 (WSL2, 16 CPU, ~11,3 GB RAM cấp cho Docker), cùng máy |
| Backend | **Bản build production**: `npm run build` rồi `node dist/main.js`, `NODE_ENV=production`, 1 tiến trình Node, pool kết nối Postgres mặc định của `pg` = 10 |
| k6 | Chạy **trên cùng máy** với backend + database (tranh CPU với nhau — xem mục 5) |
| Dữ liệu | Dữ liệu dev hiện có: 50 thiết bị / 16 danh mục, 169 đơn thuê |

**Cờ chỉ dùng khi kiểm thử** (mặc định không đặt → hệ thống giữ nguyên hành vi bình thường):

- `LOAD_TEST=true` — **tạm bỏ qua rate limit** (`skipIf` của `ThrottlerModule` trong `backend/src/auth/auth.module.ts`). Lý do: k6 bắn mọi request từ 1 địa chỉ IP, giới hạn mặc định 100 request/phút/IP sẽ chặn gần hết request công khai, làm số liệu phản ánh rate limit chứ không phải năng lực xử lý. **Khi chạy thật, rate limit vẫn bật** (100 request/phút/người dùng hoặc IP; đặt thuê 5 lần/phút/người dùng).
- `DEVICES_CACHE_DISABLED=true` (chỉ có tác dụng khi kèm `LOAD_TEST=true`) — tắt cache Redis của `GET /devices`, chỉ dùng cho kịch bản so sánh (b) (`backend/src/devices/devices-cache.service.ts`).
- `AI_ENABLED=false` — tắt Trợ lý AI để mô hình Ollama không chiếm CPU/GPU trong lúc đo (không ảnh hưởng các API được đo).

## 3. Kịch bản

| Mã | Kịch bản | Script | Tải |
|---|---|---|---|
| a1 | `GET /devices` (danh sách, có cache) — 4 tổ hợp lọc/sắp xếp/trang giống trang `/devices` | `devices-ramp.js` | 10 → 50 → 100 → 200 người dùng ảo (VU), mỗi mức 1 phút, nghỉ 0,5 s giữa 2 request |
| a2 | `GET /devices/:id` (chi tiết, ngẫu nhiên 50 máy) | `devices-ramp.js` | như a1 |
| b | `GET /devices` **tắt cache** | `devices-ramp.js` | như a1 |
| a3 / b2 | Stress `GET /devices` có cache / tắt cache — **không nghỉ** giữa các request, để tìm thông lượng tối đa | `devices-ramp.js` (`SLEEP=0`) | như a1 |
| c | Luồng hỗn hợp giống người dùng thật: xem danh sách → xem chi tiết → kiểm tra lịch trống → xem chính sách thuê (toàn bộ là đọc), nghỉ 1–2 s mỗi bước | `mixed-flow.js` | như a1 |
| d | Đặt thuê đồng thời: 100 tài khoản test (đủ CCCD + eKYC) cùng `POST /bookings` 1 thiết bị, cùng 1 khung giờ, cùng lúc; lặp 5 vòng (5 khung giờ khác nhau) | `booking-race.js` + `verify-race.js` | 100 VU × 5 vòng |

"Request/giây" theo từng mức = số request trong mức đó ÷ 60 giây.

## 4. Kết quả chi tiết

### 4.1. (a1) `GET /devices` — có cache Redis

| Mức tải | Số request | Request/giây | TB (ms) | Trung vị (ms) | p95 (ms) | p99 (ms) | Max (ms) | Lỗi |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 VU | 1.145 | 19,1 | 2,8 | 2,3 | 5,3 | 14,5 | 24,6 | 0,00% |
| 50 VU | 5.779 | 96,3 | 2,5 | 2,0 | 5,8 | 12,3 | 29,6 | 0,00% |
| 100 VU | 11.685 | 194,8 | 2,4 | 1,9 | 5,6 | 13,1 | 82,9 | 0,00% |
| 200 VU | 23.302 | 388,4 | 4,0 | 2,0 | 14,4 | 39,6 | 217,0 | 0,00% |
| **Toàn bộ** | 41.912 | 174,2 | **3,3** | 2,0 | **10,0** | **28,9** | 217,0 | **0,00%** |

→ **Đạt** mục tiêu < 100 ms với biên độ rất lớn.

### 4.2. (a2) `GET /devices/:id` — chi tiết thiết bị (không cache)

| Mức tải | Số request | Request/giây | TB (ms) | Trung vị (ms) | p95 (ms) | p99 (ms) | Max (ms) | Lỗi |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 VU | 1.135 | 18,9 | 5,1 | 3,7 | 8,4 | 38,3 | 56,1 | 0,00% |
| 50 VU | 5.770 | 96,2 | 3,7 | 3,2 | 6,2 | 17,8 | 92,9 | 0,00% |
| 100 VU | 11.619 | 193,7 | 4,3 | 3,3 | 10,8 | 23,8 | 40,0 | 0,00% |
| 200 VU | 23.308 | 388,5 | 4,8 | 3,2 | 13,9 | 27,3 | 70,9 | 0,00% |
| **Toàn bộ** | 41.833 | 174,0 | **4,5** | 3,2 | **12,3** | **25,6** | 92,9 | **0,00%** |

→ **Đạt** mục tiêu API < 300 ms. Truy vấn 1 thiết bị theo khoá chính rất nhẹ nên dù không cache vẫn nhanh.

### 4.3. (b) So sánh có cache / tắt cache cho `GET /devices`

**Tải thường** (nghỉ 0,5 s, cùng kịch bản với a1):

| Mức tải | Có cache: TB / p95 (ms) | Tắt cache: TB / p95 (ms) | Request/giây (có / tắt) |
|---|---:|---:|---:|
| 10 VU | 2,8 / 5,3 | 8,6 / 17,3 | 19,1 / 18,8 |
| 50 VU | 2,5 / 5,8 | 7,8 / 17,5 | 96,3 / 95,3 |
| 100 VU | 2,4 / 5,6 | 8,8 / 22,9 | 194,8 / 192,3 |
| 200 VU | 4,0 / 14,4 | 35,6 / 155,2 | 388,4 / 366,1 |
| **Toàn bộ** | **3,3 / 10,0** | **23,3 / 128,4** | 174,2 / 167,7 |

**Stress — không nghỉ** (a3 có cache, b2 tắt cache):

| Mức tải | Có cache: req/s | Có cache: TB / p95 / p99 (ms) | Tắt cache: req/s | Tắt cache: TB / p95 / p99 (ms) |
|---|---:|---:|---:|---:|
| 10 VU | 1.185,9 | 8,0 / 11,2 / 20,3 | 464,9 | 20,5 / 29,0 / 55,0 |
| 50 VU | 1.262,8 | 38,2 / 53,7 / 84,1 | 452,9 | 106,7 / 171,9 / 261,8 |
| 100 VU | 1.226,8 | 79,8 / 114,1 / 179,0 | 447,9 | 218,9 / 352,8 / 431,8 |
| 200 VU | 1.150,0 | 170,4 / 267,6 / 974,9 | 433,6 | 452,3 / 642,2 / 704,9 |
| **Toàn bộ** | **1.205,4** | 72,9 / 167,3 / 285,6 | **449,1** | 195,6 / 554,0 / 649,9 |
| Lỗi | 0,04% (113 / 289.533) | | 0,00% | |

![Thời gian phản hồi trung bình — có/không cache](load-test/chart-stress-cache-vs-nocache.png)

![Thông lượng tối đa — có/không cache](load-test/chart-stress-throughput.png)

**Nhận xét:**

- Ở tải thường, cache giúp thời gian trung bình giảm **~86%** (23,3 → 3,3 ms) và p95 giảm **~92%** (128,4 → 10,0 ms). Khác biệt lộ rõ ở 200 VU: không cache thì p95 vọt lên 155 ms vì các truy vấn bắt đầu phải xếp hàng chờ kết nối database.
- Ở bài stress, cache tăng **thông lượng tối đa ~2,7 lần** (449 → 1.205 req/s) và giảm thời gian trung bình ~63% (195,6 → 72,9 ms).
- Trong bài stress, thông lượng gần như **không tăng thêm** từ 10 VU trở lên (có cache ~1.200 req/s, không cache ~450 req/s): hệ thống đã chạm giới hạn ngay từ 10 VU, thêm người dùng chỉ làm request xếp hàng lâu hơn — thời gian chờ tăng gần tỷ lệ thuận với số VU (đúng định luật Little: 200 VU ÷ 1.150 req/s ≈ 174 ms, khớp TB đo được 170 ms). Giới hạn khi có cache nhiều khả năng là CPU của **1 tiến trình Node** (đọc chuỗi JSON từ Redis rồi gửi về) cộng với việc k6 chạy chung máy; khi không cache là **pool 10 kết nối Postgres** (mỗi request chạy 2 truy vấn `findMany` + `count`). Lần chạy này chưa đo CPU từng tiến trình nên đây là nhận định, chưa phải kết luận đã kiểm chứng.

### 4.4. (c) Luồng hỗn hợp giống người dùng thật

| Mức tải | Số request | Request/giây | TB (ms) | Trung vị (ms) | p95 (ms) | p99 (ms) | Max (ms) | Lỗi |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 VU | 396 | 6,6 | 3,4 | 2,8 | 8,6 | 18,5 | 61,3 | 0,00% |
| 50 VU | 2.000 | 33,3 | 2,5 | 2,5 | 4,5 | 9,7 | 24,0 | 0,00% |
| 100 VU | 4.020 | 67,0 | 2,4 | 2,3 | 5,0 | 12,2 | 52,5 | 0,00% |
| 200 VU | 8.012 | 133,5 | 2,3 | 2,0 | 4,8 | 14,8 | 79,9 | 0,00% |
| **Toàn bộ** | 14.429 | 58,5 | **2,4** | 2,1 | **4,9** | **13,9** | 79,9 | **0,00%** |

Theo từng bước:

| Bước | API | TB (ms) | p95 (ms) | p99 (ms) | Lỗi |
|---|---|---:|---:|---:|---:|
| Xem danh sách | `GET /devices` | 2,6 | 5,2 | 16,7 | 0,00% |
| Xem chi tiết | `GET /devices/:id` | 3,3 | 6,1 | 15,3 | 0,00% |
| Kiểm tra lịch trống | `GET /bookings/availability` | 2,7 | 4,5 | 13,5 | 0,00% |
| Xem chính sách | `GET /policies/rental` | 0,9 | 2,5 | 9,0 | 0,00% |

→ **Đạt** mọi mục tiêu. Mỗi người dùng ảo nghỉ 1–2 giây giữa các bước như người thật đọc trang, nên 200 người dùng đồng thời chỉ tạo ~134 req/s — hệ thống còn dư nhiều năng lực (xem bài stress ở 4.3).

### 4.5. (d) Đặt thuê đồng thời

100 tài khoản test (tạo bằng `load-tests/seed-users.js`, đã có CCCD + đủ 3 ảnh eKYC dạng `public_id` giả để qua kiểm tra nghiệp vụ) cùng gửi `POST /bookings` cho **1 thiết bị, 1 khung giờ** tại cùng 1 thời điểm; lặp 5 vòng với 5 khung giờ khác nhau.

| Vòng | Thành công (201) | Bị từ chối (409) | Lỗi khác | TB (ms) | Max (ms) |
|---|---:|---:|---:|---:|---:|
| 1 | 1 | 99 | 0 | 453,8 | 652,9 |
| 2 | 1 | 99 | 0 | 446,2 | 620,5 |
| 3 | 1 | 99 | 0 | 307,8 | 479,6 |
| 4 | 1 | 99 | 0 | 305,5 | 463,4 |
| 5 | 1 | 99 | 0 | 470,7 | 651,8 |
| **Tổng** | **5** | **495** | **0** | **396,8** (trung vị 393,4; p95 616,0; p99 645,3) | 652,9 |

Kiểm tra database ngay sau khi chạy (`load-tests/verify-race.js`): mỗi khung giờ có **đúng 1 đơn** (`pending`), và trên toàn bộ database có **0 cặp đơn chồng lịch** trên cùng thiết bị.

**Nhận xét:**

- **Tính đúng đắn: Đạt tuyệt đối** — cơ chế transaction + `SELECT … FOR UPDATE` + Exclusion Constraint (mục 5 Roadmap) giữ đúng "chỉ 1 người thắng" kể cả khi 100 request đến cùng lúc; 99 người còn lại nhận 409 với thông báo rõ ràng, không có lỗi 500 nào.
- **Thời gian phản hồi TB 397 ms — vượt mục tiêu 300 ms.** Đây là hệ quả có chủ đích của thiết kế: khoá dòng thiết bị buộc 100 request **xử lý lần lượt** (mỗi transaction chỉ vài ms, nhưng request thứ 100 phải chờ 99 request trước), cộng thêm pool chỉ 10 kết nối database. Tình huống 100 người cùng giành 1 máy cùng 1 khung giờ trong cùng 1 giây gần như không xảy ra trong thực tế cửa hàng cho thuê; đánh đổi "chậm hơn một chút khi tranh chấp" để "không bao giờ đặt trùng" là đúng ưu tiên. Ngoài ra rate limit thật (5 lần đặt/phút/người dùng) vẫn hoạt động khi chạy thật.

## 5. Phát hiện và hạn chế

### 5.1. Lỗi 500 khi cache hết hạn dưới tải cực cao (chưa sửa — chờ quyết định)

Trong bài stress có cache ở mức 200 VU (~1.150 req/s), **113 request (0,04% tổng, 0,16% ở mức 200 VU)** trả lỗi 500. Log server cho thấy toàn bộ là `Transaction API error: Unable to start a transaction in the given time`.

Nguyên nhân: mọi key cache danh sách có cùng thời hạn 45 giây nên **hết hạn gần như cùng lúc**; ngay sau đó hàng trăm request đồng thời cùng "trượt cache" và cùng mở `$transaction([findMany, count])` (hiện tượng *cache stampede*), trong khi pool chỉ có 10 kết nối → các request chờ quá thời hạn 2 giây mặc định của Prisma bị huỷ. Bài stress **không cache** lại không có lỗi vì tải lên database đều đặn chứ không dồn thành từng đợt.

Mức lỗi vẫn dưới mục tiêu 1% và chỉ xảy ra ở mức tải ~11 lần mục tiêu, nhưng đây là điểm yếu thật. Hướng xử lý có thể làm (chưa làm, cần người dùng quyết định):

1. Gộp các request trượt cache cùng key thành 1 truy vấn (single-flight/khoá ngắn trên Redis) — giải quyết tận gốc stampede.
2. Tăng kích thước pool kết nối (`max` của `PrismaPg`, VD 20–30) và/hoặc nới `maxWait` của transaction.
3. Bỏ `$transaction` cho cặp `findMany` + `count` (chỉ đọc, không cần tính nguyên tử chặt chẽ) để không giữ kết nối lâu.
4. Thêm độ lệch ngẫu nhiên vào TTL (VD 40–50 s) để các key không hết hạn cùng lúc.

### 5.2. Hạn chế của phép đo

- k6, backend, Postgres và Redis chạy **trên cùng 1 laptop**: k6 tiêu tốn CPU đáng kể ở bài stress nên con số thông lượng tối đa là **giới hạn dưới** của năng lực thật; ngược lại không có độ trễ mạng giữa client–server và server–database như khi triển khai thật.
- Backend chạy **1 tiến trình Node** (chưa dùng cluster/PM2 nhiều tiến trình), pool database mặc định 10 kết nối — chưa tinh chỉnh cho hiệu năng.
- Dữ liệu ở quy mô demo (50 thiết bị, 169 đơn); quy mô lớn hơn sẽ làm truy vấn không cache chậm hơn và lợi ích của cache càng rõ.
- Không đo kịch bản ghi nặng khác (thanh toán VNPay, upload ảnh) — các luồng này phụ thuộc dịch vụ bên ngoài (VNPay Sandbox, Cloudinary) nên không phù hợp đo tải trên máy local.
- Mục "thời gian tải trang lần đầu < 3 s trên 4G" (frontend) không thuộc phạm vi k6, chưa đo trong lần này.

## 6. Cách chạy lại

```bash
# 1. Database + Redis
docker compose up -d
# 2. Backend bản production, bỏ qua rate limit chỉ cho lần đo
cd backend && npm run build
LOAD_TEST=true AI_ENABLED=false NODE_ENV=production node dist/main.js
#    (kịch bản b: thêm DEVICES_CACHE_DISABLED=true)
# 3. Chạy k6 (trong thư mục load-tests/)
k6 run -e TARGET=list   -e NAME=a1-devices-list-cache devices-ramp.js
k6 run -e TARGET=detail -e NAME=a2-devices-detail     devices-ramp.js
k6 run -e TARGET=list -e SLEEP=0 -e NAME=a3-devices-list-cache-stress devices-ramp.js
k6 run -e NAME=c-mixed-flow mixed-flow.js
# 4. Đặt thuê đồng thời
node seed-users.js 100
k6 run -e USERS=100 -e ROUNDS=5 -e NAME=d-booking-race booking-race.js
node verify-race.js
# 5. Dọn dữ liệu test + tổng hợp bảng/biểu đồ
node cleanup.js
python report.py
```

Dữ liệu test đã được dọn sau lần chạy này: 100 tài khoản `loadtest.*@techrent.test`, 5 đơn, 10 thông báo gửi nhân viên về các đơn đó, 5 job TTL BullMQ và cache danh sách. Số bản ghi trở về đúng như trước khi chạy (23 tài khoản, 169 đơn, 89 thông báo).
