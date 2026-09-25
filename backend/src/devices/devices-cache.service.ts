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
 */
@Injectable()
export class DevicesCacheService {
  private readonly logger = new Logger(DevicesCacheService.name);

  private static readonly TTL_SECONDS = 45;
  private static readonly KEY_PREFIX = 'devices:list:';
  private static readonly INDEX_KEY = 'devices:list:keys';

  constructor(private readonly redisService: RedisService) {}

  buildKey(filter: {
    page: number;
    limit: number;
    categoryId?: string;
    status?: string;
    search?: string;
    sort?: string;
  }): string {
    const parts = [
      filter.page,
      filter.limit,
      filter.categoryId ?? '',
      filter.status ?? '',
      filter.search ?? '',
      filter.sort ?? '',
    ];
    return `${DevicesCacheService.KEY_PREFIX}${parts.join(':')}`;
  }

  /** Cache miss/lỗi Redis đều trả `null` — gọi nơi luôn có fallback truy vấn DB thật. */
  async get<T>(key: string): Promise<T | null> {
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
    try {
      await this.redisService.client
        .multi()
        .set(key, JSON.stringify(value), 'EX', DevicesCacheService.TTL_SECONDS)
        .sadd(DevicesCacheService.INDEX_KEY, key)
        .exec();
    } catch (error) {
      this.logger.warn(`Lỗi ghi cache "${key}": ${(error as Error).message}`);
    }
  }

  async invalidateAll(): Promise<void> {
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
