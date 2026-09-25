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
      const filter = { page: 2, limit: 10, categoryId: 'cat-1', sort: 'price_asc' };
      expect(service.buildKey(filter)).toBe(service.buildKey({ ...filter }));
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
        45,
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
});
