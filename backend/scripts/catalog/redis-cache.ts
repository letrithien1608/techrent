import Redis from 'ioredis';

/**
 * Xoá toàn bộ cache danh sách thiết bị (cùng cơ chế DevicesCacheService.invalidateAll():
 * đọc "sổ ghi" key rồi DEL) — dùng cho script chạy ngoài Nest app.
 */
export async function invalidateDeviceListCache(): Promise<number> {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
  });
  try {
    const keys = await redis.smembers('devices:list:keys');
    if (keys.length) await redis.del(...keys);
    await redis.del('devices:list:keys');
    return keys.length;
  } finally {
    redis.disconnect();
  }
}
