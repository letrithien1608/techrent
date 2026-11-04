import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Cache Redis cho `GET /devices` (mục 9 Roadmap — Non-functional, mục tiêu
 * response time < 100ms). Dùng lại `RedisService` đã có sẵn (global,
 * `backend/src/redis/`), KHÔNG tạo kết nối Redis mới — khác BullMQ (cố ý
 * dùng kết nối riêng vì cần `maxRetriesPerRequest: null` cho lệnh blocking
 * nội bộ, xem `AppModule`/mục 2 CLAUDE.md); cache đọc/ghi thường không cần
 * điều đó nên dùng chung client blacklist-token là hợp lý.
 *
 * KHÔNG cache riêng theo từng thiết bị — chỉ cache NGUYÊN 1 TRANG kết quả
 * `findAll()` theo đúng tổ hợp filter (page/limit/categoryId/status/search/
 * sort đều nằm trong cache key). Khi có bất kỳ thay đổi nào ảnh hưởng tới
 * danh sách (tạo/sửa/xoá thiết bị, đổi status qua booking/maintenance/admin,
 * hoặc rating trung bình đổi vì có review mới) → `invalidateAll()` xoá SẠCH
 * toàn bộ cache danh sách (mọi tổ hợp filter cùng lúc) thay vì cố tính chính
 * xác cache key nào bị ảnh hưởng — đơn giản và an toàn hơn hẳn (tránh bug
 * "quên invalidate 1 tổ hợp filter"), chấp nhận vài cache miss dồn lại ngay
 * sau đó rồi tự build lại nhanh.
 *
 * Dùng 1 SET Redis (`INDEX_KEY`) làm "sổ ghi" toàn bộ cache key đang tồn tại
 * — invalidateAll() đọc sổ này rồi DEL đúng các key đó (+ tự xoá sổ), KHÔNG
 * dùng lệnh `KEYS`/`SCAN` quét pattern (chậm hơn ở quy mô lớn, dù ở quy mô
 * demo hiện tại sự khác biệt không đáng kể — vẫn chọn cách đúng chuẩn hơn).
 *
 * Chống cache stampede (phát hiện khi kiểm thử tải k6, 04/11 —
 * `docs/load-test-result.md` mục 5.1): mọi key từng có cùng TTL 45 s nên hết
 * hạn cùng lúc, hàng trăm request trượt cache cùng mở truy vấn DB → pool cạn
 * → lỗi 500. Hai lớp chống:
 *  1. `getOrLoad()` gộp các request trượt cache CÙNG key trong tiến trình này
 *     thành ĐÚNG 1 lần gọi `loader` (single-flight, map promise đang chạy).
 *  2. TTL lệch ngẫu nhiên `TTL_SECONDS ± TTL_JITTER_SECONDS` để các key không
 *     hết hạn cùng một thời điểm.
 * `invalidateAll()` tăng `generation` + bỏ các promise đang chạy: request đến
 * SAU khi xoá cache không nhập vào truy vấn cũ, và truy vấn cũ (có thể đọc dữ
 * liệu trước thay đổi) KHÔNG được ghi đè vào cache.
 */
@Injectable()
export class DevicesCacheService {
  private readonly logger = new Logger(DevicesCacheService.name);

  private static readonly TTL_SECONDS = 45;
  private static readonly TTL_JITTER_SECONDS = 10;
  private static readonly KEY_PREFIX = 'devices:list:';
  private static readonly INDEX_KEY = 'devices:list:keys';

  /** Truy vấn DB đang chạy theo cache key (single-flight, chỉ trong tiến trình này). */
  private readonly inFlight = new Map<string, Promise<unknown>>();
  /** Tăng mỗi lần `invalidateAll()` — kết quả của truy vấn bắt đầu trước đó không được ghi vào cache. */
  private generation = 0;

  constructor(private readonly redisService: RedisService) {}

  /** TTL ngẫu nhiên trong [45 − 10, 45 + 10] giây. */
  ttlSeconds(): number {
    const { TTL_SECONDS, TTL_JITTER_SECONDS } = DevicesCacheService;
    return (
      TTL_SECONDS -
      TTL_JITTER_SECONDS +
      Math.floor(Math.random() * (2 * TTL_JITTER_SECONDS + 1))
    );
  }

  /**
   * Đọc cache; trượt cache thì gọi `loader` (truy vấn DB) rồi lưu lại. Các
   * request đồng thời trượt CÙNG key dùng chung 1 lần gọi `loader`. Lỗi của
   * `loader` trả về cho mọi request đang chờ, không lưu vào cache.
   */
  async getOrLoad<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (DevicesCacheService.isDisabledForLoadTest()) return loader();

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const cached = await this.get<T>(key);
    if (cached) return cached;

    // Có thể request khác đã bắt đầu tải trong lúc chờ Redis.
    const started = this.inFlight.get(key);
    if (started) return started as Promise<T>;

    const generation = this.generation;
    const promise: Promise<T> = (async () => {
      const value = await loader();
      if (generation === this.generation) await this.set(key, value);
      return value;
    })().finally(() => {
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  buildKey(filter: {
    page: number;
    limit: number;
    categoryId?: string;
    status?: string;
    search?: string;
    sort?: string;
    includeDiscontinued?: boolean;
  }): string {
    const parts = [
      filter.page,
      filter.limit,
      filter.categoryId ?? '',
      filter.status ?? '',
      filter.search ?? '',
      filter.sort ?? '',
      filter.includeDiscontinued ? 'all' : '',
    ];
    return `${DevicesCacheService.KEY_PREFIX}${parts.join(':')}`;
  }

  /**
   * Tắt cache CHỈ để đo so sánh có/không cache khi kiểm thử tải (load-tests/):
   * phải đặt CẢ `LOAD_TEST=true` lẫn `DEVICES_CACHE_DISABLED=true`. Mặc định
   * (không đặt biến) cache luôn bật.
   */
  private static isDisabledForLoadTest(): boolean {
    return (
      process.env.LOAD_TEST === 'true' &&
      process.env.DEVICES_CACHE_DISABLED === 'true'
    );
  }

  /** Cache miss/lỗi Redis đều trả `null` — gọi nơi luôn có fallback truy vấn DB thật. */
  async get<T>(key: string): Promise<T | null> {
    if (DevicesCacheService.isDisabledForLoadTest()) return null;
    try {
      const raw = await this.redisService.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn(`Lỗi đọc cache "${key}": ${(error as Error).message}`);
      return null;
    }
  }

  /** Lỗi ghi cache (VD Redis tạm gián đoạn) chỉ log, KHÔNG throw — request vẫn đã có dữ liệu thật từ DB để trả về. */
  async set(key: string, value: unknown): Promise<void> {
    if (DevicesCacheService.isDisabledForLoadTest()) return;
    try {
      await this.redisService.client
        .multi()
        .set(key, JSON.stringify(value), 'EX', this.ttlSeconds())
        .sadd(DevicesCacheService.INDEX_KEY, key)
        .exec();
    } catch (error) {
      this.logger.warn(`Lỗi ghi cache "${key}": ${(error as Error).message}`);
    }
  }

  async invalidateAll(): Promise<void> {
    this.generation += 1;
    this.inFlight.clear();
    try {
      const keys = await this.redisService.client.smembers(
        DevicesCacheService.INDEX_KEY,
      );
      await this.redisService.client.del(
        ...keys,
        DevicesCacheService.INDEX_KEY,
      );
    } catch (error) {
      this.logger.warn(
        `Lỗi xoá cache danh sách thiết bị: ${(error as Error).message}`,
      );
    }
  }
}
