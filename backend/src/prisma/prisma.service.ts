import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Số kết nối tối đa của pool `pg` (mặc định của `pg` là 10). Nâng lên 20: kiểm
 * thử tải (`docs/load-test-result.md`) cho thấy 10 kết nối là nút thắt khi
 * nhiều request cùng truy vấn (danh sách tắt cache chạm trần ~450 req/s, 100
 * người cùng đặt 1 máy phải xếp hàng chờ kết nối). 20 vẫn chừa nhiều chỗ trong
 * giới hạn mặc định 100 kết nối của PostgreSQL cho dev server + e2e test +
 * công cụ quản trị chạy cùng lúc. Đổi qua env `DATABASE_POOL_MAX`.
 */
export const DEFAULT_DATABASE_POOL_MAX = 20;

export function resolvePoolMax(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_DATABASE_POOL_MAX;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: resolvePoolMax(process.env.DATABASE_POOL_MAX),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
