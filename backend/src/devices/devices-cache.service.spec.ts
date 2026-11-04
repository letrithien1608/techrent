import { RedisService } from '../redis/redis.service';
import { DevicesCacheService } from './devices-cache.service';

describe('DevicesCacheService', () => {
  let service: DevicesCacheService;
  let client: {
    get: jest.Mock;
    set: jest.Mock;
    smembers: jest.Mock;
    del: jest.Mock;
    multi: jest.Mock;
  };
  let multiChain: { set: jest.Mock; sadd: jest.Mock; exec: jest.Mock };

  beforeEach(() => {
    multiChain = {
      set: jest.fn(),
      sadd: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    // `multi()` trả về chính `multiChain` để .set()/.sadd() có thể "chain"
    // giống ioredis thật (mỗi lệnh trả về `this`).
    multiChain.set.mockReturnValue(multiChain);
    multiChain.sadd.mockReturnValue(multiChain);

    client = {
      get: jest.fn(),
      set: jest.fn(),
      smembers: jest.fn().mockResolvedValue([]),
      del: jest.fn(),
      multi: jest.fn().mockReturnValue(multiChain),
    };
    const redisService = { client } as unknown as RedisService;
    service = new DevicesCacheService(redisService);
  });

  describe('buildKey', () => {
    it('cache key khác nhau cho các tổ hợp filter khác nhau (page/limit/categoryId/status/search/sort)', () => {
      const base = { page: 1, limit: 20 };
      const withCategory = { ...base, categoryId: 'cat-1' };
      const withSearch = { ...base, search: 'macbook' };

      const keyBase = service.buildKey(base);
      const keyCategory = service.buildKey(withCategory);
      const keySearch = service.buildKey(withSearch);

      expect(new Set([keyBase, keyCategory, keySearch]).size).toBe(3);
    });

    it('cùng 1 tổ hợp filter luôn ra ĐÚNG 1 cache key (deterministic)', () => {
      const filter = {
        page: 2,
        limit: 10,
        categoryId: 'cat-1',
        sort: 'price_asc',
      };
      expect(service.buildKey(filter)).toBe(service.buildKey({ ...filter }));
    });
  });

  describe('cờ tắt cache khi kiểm thử tải', () => {
    afterEach(() => {
      delete process.env.LOAD_TEST;
      delete process.env.DEVICES_CACHE_DISABLED;
    });

    it('LOAD_TEST=true + DEVICES_CACHE_DISABLED=true: không đọc/ghi Redis', async () => {
      process.env.LOAD_TEST = 'true';
      process.env.DEVICES_CACHE_DISABLED = 'true';
      client.get.mockResolvedValue(JSON.stringify({ data: [] }));

      expect(await service.get('devices:list:1:20:::')).toBeNull();
      await service.set('devices:list:1:20:::', { data: [] });

      expect(client.get).not.toHaveBeenCalled();
      expect(client.multi).not.toHaveBeenCalled();
    });

    it('chỉ đặt DEVICES_CACHE_DISABLED (thiếu LOAD_TEST): cache vẫn bật', async () => {
      process.env.DEVICES_CACHE_DISABLED = 'true';
      client.get.mockResolvedValue(JSON.stringify({ data: [] }));

      expect(await service.get('devices:list:1:20:::')).toEqual({ data: [] });
    });
  });

  describe('get (cache hit/miss)', () => {
    it('cache HIT: trả đúng dữ liệu đã lưu (JSON.parse lại đúng)', async () => {
      const cachedValue = { data: [{ id: 'device-1' }], meta: { total: 1 } };
      client.get.mockResolvedValue(JSON.stringify(cachedValue));

      const result = await service.get('devices:list:1:20:::');

      expect(result).toEqual(cachedValue);
    });

    it('cache MISS: key không tồn tại -> trả null', async () => {
      client.get.mockResolvedValue(null);
      const result = await service.get('devices:list:1:20:::');
      expect(result).toBeNull();
    });

    it('lỗi Redis lúc đọc -> trả null (KHÔNG throw, để caller tự fallback query DB)', async () => {
      client.get.mockRejectedValue(new Error('Redis down'));
      const result = await service.get('devices:list:1:20:::');
      expect(result).toBeNull();
    });
  });

  describe('set (lưu cache)', () => {
    it('lưu đúng key với TTL + thêm key vào set index để invalidateAll() sau này tìm lại được', async () => {
      await service.set('devices:list:1:20:::', { data: [] });

      expect(client.multi).toHaveBeenCalled();
      expect(multiChain.set).toHaveBeenCalledWith(
        'devices:list:1:20:::',
        JSON.stringify({ data: [] }),
        'EX',
        expect.any(Number),
      );
      expect(multiChain.sadd).toHaveBeenCalledWith(
        'devices:list:keys',
        'devices:list:1:20:::',
      );
      expect(multiChain.exec).toHaveBeenCalled();
    });

    it('lỗi Redis lúc ghi -> KHÔNG throw (chỉ log warning)', async () => {
      multiChain.exec.mockRejectedValue(new Error('Redis down'));
      await expect(
        service.set('devices:list:1:20:::', { data: [] }),
      ).resolves.toBeUndefined();
    });
  });

  describe('invalidateAll (xoá cache sau khi có thay đổi ảnh hưởng danh sách)', () => {
    it('xoá TẤT CẢ key đã lưu (đọc từ set index) VÀ xoá luôn set index', async () => {
      client.smembers.mockResolvedValue([
        'devices:list:1:20:::',
        'devices:list:2:20:::',
      ]);

      await service.invalidateAll();

      expect(client.del).toHaveBeenCalledWith(
        'devices:list:1:20:::',
        'devices:list:2:20:::',
        'devices:list:keys',
      );
    });

    it('không có cache key nào đang tồn tại vẫn xoá được set index, không lỗi', async () => {
      client.smembers.mockResolvedValue([]);
      await expect(service.invalidateAll()).resolves.toBeUndefined();
      expect(client.del).toHaveBeenCalledWith('devices:list:keys');
    });

    it('lỗi Redis lúc invalidate -> KHÔNG throw (chỉ log warning, không làm hỏng hành động nghiệp vụ chính)', async () => {
      client.smembers.mockRejectedValue(new Error('Redis down'));
      await expect(service.invalidateAll()).resolves.toBeUndefined();
    });
  });

  describe('TTL lệch ngẫu nhiên (chống các key hết hạn cùng lúc)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('TTL nằm trong [35, 55] giây, đủ cả 2 biên', () => {
      jest.spyOn(Math, 'random').mockReturnValueOnce(0);
      expect(service.ttlSeconds()).toBe(35);
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.999999);
      expect(service.ttlSeconds()).toBe(55);
      jest.spyOn(Math, 'random').mockReturnValueOnce(0.5);
      expect(service.ttlSeconds()).toBe(45);
    });

    it('các key lưu liên tiếp nhận TTL khác nhau', async () => {
      jest.restoreAllMocks();
      const ttls = new Set<number>();
      for (let i = 0; i < 50; i++) {
        await service.set(`devices:list:${i}`, { data: [] });
        const ttl = multiChain.set.mock.calls[i][3] as number;
        expect(ttl).toBeGreaterThanOrEqual(35);
        expect(ttl).toBeLessThanOrEqual(55);
        ttls.add(ttl);
      }
      expect(ttls.size).toBeGreaterThan(1);
    });
  });

  describe('getOrLoad (single-flight)', () => {
    const KEY = 'devices:list:1:12:::::';

    /** Promise điều khiển được để giữ truy vấn DB "đang chạy". */
    function deferred<T>() {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    beforeEach(() => client.get.mockResolvedValue(null));

    it('100 request đồng thời trượt cache cùng key → chỉ 1 lần truy vấn DB, mọi request nhận cùng kết quả', async () => {
      const db = deferred<{ data: string[] }>();
      const loader = jest.fn(() => db.promise);

      const requests = Array.from({ length: 100 }, () =>
        service.getOrLoad(KEY, loader),
      );
      // Cho mọi request đi qua bước đọc Redis rồi mới trả kết quả DB.
      await new Promise((r) => setImmediate(r));
      db.resolve({ data: ['device-1'] });
      const results = await Promise.all(requests);

      expect(loader).toHaveBeenCalledTimes(1);
      expect(results.every((r) => r.data[0] === 'device-1')).toBe(true);
      expect(multiChain.set).toHaveBeenCalledTimes(1);
    });

    it('key khác nhau không dùng chung truy vấn', async () => {
      const loader = jest.fn().mockResolvedValue({ data: [] });
      await Promise.all([
        service.getOrLoad(KEY, loader),
        service.getOrLoad('devices:list:2:12:::::', loader),
      ]);
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('cache HIT không gọi DB', async () => {
      client.get.mockResolvedValue(JSON.stringify({ data: ['cached'] }));
      const loader = jest.fn();
      expect(await service.getOrLoad(KEY, loader)).toEqual({
        data: ['cached'],
      });
      expect(loader).not.toHaveBeenCalled();
    });

    it('truy vấn xong thì lần trượt cache sau truy vấn lại (không giữ promise cũ)', async () => {
      const loader = jest.fn().mockResolvedValue({ data: [] });
      await service.getOrLoad(KEY, loader);
      await service.getOrLoad(KEY, loader);
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('truy vấn lỗi: mọi request đang chờ nhận lỗi, không lưu cache, lần sau thử lại được', async () => {
      const db = deferred<unknown>();
      const loader = jest.fn(() => db.promise);
      const requests = [1, 2, 3].map(() => service.getOrLoad(KEY, loader));
      await new Promise((r) => setImmediate(r));
      db.reject(new Error('DB down'));

      for (const r of requests) await expect(r).rejects.toThrow('DB down');
      expect(loader).toHaveBeenCalledTimes(1);
      expect(multiChain.set).not.toHaveBeenCalled();

      const retry = jest.fn().mockResolvedValue({ data: [] });
      await service.getOrLoad(KEY, retry);
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it('invalidateAll() giữa chừng: truy vấn cũ không ghi vào cache, request mới không nhập vào truy vấn cũ', async () => {
      const oldDb = deferred<{ data: string[] }>();
      const oldLoader = jest.fn(() => oldDb.promise);
      const oldRequest = service.getOrLoad(KEY, oldLoader);
      await new Promise((r) => setImmediate(r));

      await service.invalidateAll();

      const newLoader = jest.fn().mockResolvedValue({ data: ['new'] });
      const newResult = await service.getOrLoad(KEY, newLoader);
      oldDb.resolve({ data: ['old'] });
      await oldRequest;

      expect(newLoader).toHaveBeenCalledTimes(1);
      expect(newResult).toEqual({ data: ['new'] });
      // Chỉ kết quả mới được ghi vào cache.
      expect(multiChain.set).toHaveBeenCalledTimes(1);
      expect(multiChain.set.mock.calls[0][1]).toBe(
        JSON.stringify({ data: ['new'] }),
      );
    });

    it('cờ tắt cache khi kiểm thử tải: luôn gọi DB, không gộp', async () => {
      process.env.LOAD_TEST = 'true';
      process.env.DEVICES_CACHE_DISABLED = 'true';
      try {
        const loader = jest.fn().mockResolvedValue({ data: [] });
        await Promise.all([
          service.getOrLoad(KEY, loader),
          service.getOrLoad(KEY, loader),
        ]);
        expect(loader).toHaveBeenCalledTimes(2);
        expect(client.get).not.toHaveBeenCalled();
      } finally {
        delete process.env.LOAD_TEST;
        delete process.env.DEVICES_CACHE_DISABLED;
      }
    });
  });
});
