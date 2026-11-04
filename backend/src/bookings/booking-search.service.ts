import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  joinSql,
  orderByIds,
  parseSearch,
  plainLike,
  unaccentContains,
  utcTimestamp,
  vnDateRange,
} from '../common/search/admin-search.util';
import type { SearchBookingsQueryDto } from './dto/search-bookings-query.dto';

const searchResultInclude = {
  include: {
    device: {
      select: {
        id: true,
        name: true,
        images: true,
        categoryId: true,
        serialNumber: true,
      },
    },
    user: { select: { id: true, name: true, phone: true, email: true } },
  },
} satisfies Prisma.BookingDefaultArgs;

export type BookingSearchRow = Prisma.BookingGetPayload<
  typeof searchResultInclude
>;

/**
 * Tìm + lọc đơn ở trang quản trị. Lọc/sắp xếp/phân trang chạy HẾT trong 1 câu
 * SQL (cần `f_unaccent` mà Prisma không biểu diễn được), rồi mới nạp dữ liệu
 * đầy đủ của đúng trang đó bằng findMany.
 */
@Injectable()
export class BookingSearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Điều kiện WHERE (b = bookings, u = users, d = devices). Xuất ra để test. */
  buildWhere(query: SearchBookingsQueryDto): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];

    const search = parseSearch(query.q);
    if (search?.digits) {
      conditions.push(
        joinSql(
          [
            plainLike('u.phone', search.digits, 'contains'),
            plainLike('d.serial_number', search.digits, 'contains'),
            plainLike('b.id', search.digits, 'prefix'),
          ],
          'OR',
        ),
      );
    } else if (search) {
      // Mỗi từ phải khớp ÍT NHẤT 1 trường → "canon r6" khớp "Canon EOS R6 Mark II".
      for (const token of search.tokens) {
        conditions.push(
          joinSql(
            [
              plainLike('b.id', token, 'prefix'),
              unaccentContains('u.name', token),
              plainLike('u.email', token, 'contains'),
              plainLike('u.phone', token, 'contains'),
              unaccentContains('d.name', token),
              plainLike('d.serial_number', token, 'contains'),
            ],
            'OR',
          ),
        );
      }
    }

    if (query.status) {
      conditions.push(Prisma.sql`b.status = ${query.status}::"BookingStatus"`);
    }
    if (query.depositRefundStatus) {
      conditions.push(
        Prisma.sql`b.deposit_refund_status = ${query.depositRefundStatus}::"DepositRefundStatus"`,
      );
    }
    // Thời gian thuê GIAO với khoảng ngày đã chọn (giờ VN).
    const { start, end } = vnDateRange(query.from, query.to);
    if (end) conditions.push(Prisma.sql`b.start_time < ${utcTimestamp(end)}`);
    if (start) conditions.push(Prisma.sql`b.end_time > ${utcTimestamp(start)}`);
    if (query.hasDebt) {
      conditions.push(Prisma.sql`b.amount_owed > b.debt_paid_amount`);
    }
    if (query.suspectedLost) {
      conditions.push(
        Prisma.sql`b.suspected_lost_at IS NOT NULL AND b.status = ${BookingStatus.ongoing}::"BookingStatus"`,
      );
    }
    if (query.hideDemo !== false) {
      conditions.push(Prisma.sql`b.is_demo = false`);
    }
    return joinSql(conditions, 'AND');
  }

  buildOrderBy(sort: SearchBookingsQueryDto['sort']): Prisma.Sql {
    switch (sort) {
      // Ngày nhận máy gần hôm nay nhất: đơn sắp nhận (gần nhất trước), rồi
      // tới đơn đã nhận (mới nhất trước).
      case 'pickup':
        return Prisma.sql`(b.start_time < now() AT TIME ZONE 'UTC'), CASE WHEN b.start_time >= now() AT TIME ZONE 'UTC' THEN b.start_time END ASC, b.start_time DESC, b.id`;
      // Giá trị đơn = tiền thuê.
      case 'value':
        return Prisma.sql`b.total_price DESC, b.created_at DESC, b.id`;
      default:
        return Prisma.sql`b.created_at DESC, b.id`;
    }
  }

  async search(query: SearchBookingsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = this.buildWhere(query);
    const from = Prisma.sql`FROM bookings b JOIN users u ON u.id = b.user_id JOIN devices d ON d.id = b.device_id WHERE ${where}`;

    const [idRows, countRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT b.id ${from} ORDER BY ${this.buildOrderBy(query.sort)} LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      ),
      this.prisma.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS total ${from}`,
      ),
    ]);
    const ids = idRows.map((row) => row.id);
    const rows = ids.length
      ? await this.prisma.booking.findMany({
          where: { id: { in: ids } },
          ...searchResultInclude,
        })
      : [];
    const total = Number(countRows[0]?.total ?? 0);
    return {
      data: orderByIds(rows, ids),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
