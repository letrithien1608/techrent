import { BookingStatus, Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { BookingSearchService } from './booking-search.service';

/**
 * Lắp ráp câu SQL + kết quả. Ngữ nghĩa thật (bỏ dấu, khoảng ngày, phân
 * trang trên dữ liệu thật) kiểm tra ở test/admin-search.e2e-spec.ts.
 */
describe('BookingSearchService', () => {
  const prisma = {
    $queryRaw: jest.fn(),
    booking: { findMany: jest.fn() },
  };
  const service = new BookingSearchService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  describe('buildWhere', () => {
    it('mặc định chỉ ẩn đơn dữ liệu mẫu', () => {
      expect(service.buildWhere({}).sql).toBe('(b.is_demo = false)');
      expect(service.buildWhere({ hideDemo: false }).sql).toBe('TRUE');
    });

    it('từ chữ: mỗi từ khớp mã đơn (đầu chuỗi) / tên khách / email / SĐT / tên máy / serial', () => {
      const where = service.buildWhere({ q: 'canon r6', hideDemo: false });
      expect(where.sql).toContain('lower(b.id) LIKE');
      expect(where.sql).toContain('lower(f_unaccent(d.name))');
      expect(where.sql).toContain('lower(d.serial_number) LIKE');
      // 2 từ → 2 nhóm OR nối bằng AND.
      expect(where.sql.split(') AND (')).toHaveLength(2);
      expect(where.values).toContain('canon%');
      expect(where.values).toContain('%r6%');
    });

    it('mã đơn "#ab12" → so đầu chuỗi id', () => {
      const where = service.buildWhere({ q: '#AB12', hideDemo: false });
      expect(where.values[0]).toBe('ab12%');
    });

    it('chuỗi số → SĐT khách, serial, đầu mã đơn', () => {
      const where = service.buildWhere({ q: '0901 234 567', hideDemo: false });
      expect(where.values).toEqual([
        '%0901234567%',
        '%0901234567%',
        '0901234567%',
      ]);
    });

    it('khoảng ngày theo giờ VN: đơn có thời gian thuê giao với khoảng đó', () => {
      const where = service.buildWhere({
        from: '2026-11-05',
        to: '2026-11-05',
        hideDemo: false,
      });
      expect(where.sql).toContain('b.start_time <');
      expect(where.sql).toContain('b.end_time >');
      expect(where.values).toEqual([
        '2026-11-05T17:00:00.000',
        '2026-11-04T17:00:00.000',
      ]);
    });

    it('kết hợp trạng thái + hoàn cọc + còn nợ + nghi mất', () => {
      const where = service.buildWhere({
        status: BookingStatus.ongoing,
        depositRefundStatus: 'pending',
        hasDebt: true,
        suspectedLost: true,
      });
      expect(where.sql).toContain('b.amount_owed > b.debt_paid_amount');
      expect(where.sql).toContain('b.suspected_lost_at IS NOT NULL');
      expect(where.values).toEqual(['ongoing', 'pending', 'ongoing']);
    });
  });

  it('search(): trả theo đúng thứ tự SQL, tổng lấy từ COUNT, phân trang đúng offset', async () => {
    prisma.$queryRaw.mockImplementation((query: Prisma.Sql) =>
      Promise.resolve(
        query.sql.includes('COUNT(*)')
          ? [{ total: BigInt(23) }]
          : [{ id: 'b2' }, { id: 'b1' }],
      ),
    );
    prisma.booking.findMany.mockResolvedValue([{ id: 'b1' }, { id: 'b2' }]);

    const result = await service.search({ page: 3, limit: 10, sort: 'value' });

    expect(result.data.map((b) => b.id)).toEqual(['b2', 'b1']);
    expect(result.meta).toEqual({
      page: 3,
      limit: 10,
      total: 23,
      totalPages: 3,
    });
    const idQuery = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(idQuery.sql).toContain('ORDER BY b.total_price DESC');
    expect(idQuery.values.slice(-2)).toEqual([10, 20]);
  });
});
