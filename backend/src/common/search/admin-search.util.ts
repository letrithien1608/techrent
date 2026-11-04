import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

/**
 * Tìm kiếm ở trang quản trị (05/11) — dùng chung cho đơn thuê và người dùng.
 * So khớp bằng `lower(f_unaccent(cột)) LIKE '%từ%'` (hàm `f_unaccent` tạo ở
 * migration `admin_search_unaccent`) nên không phân biệt hoa thường lẫn dấu.
 */

/** Tối đa số từ xét trong 1 câu tìm (mỗi từ là 1 điều kiện AND). */
export const MAX_SEARCH_TOKENS = 6;
export const MAX_SEARCH_LENGTH = 100;

/**
 * @Transform cho query param boolean (xem CLAUDE.md mục 2). Giá trị khác
 * "true"/"false" giữ nguyên để @IsBoolean báo 400 thay vì âm thầm thành false.
 */
export const toBoolQuery = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export interface ParsedSearch {
  /** Các từ đã tách (chưa bỏ dấu — Postgres bỏ dấu cùng cách với cột). */
  tokens: string[];
  /**
   * Câu tìm chỉ gồm chữ số (bỏ khoảng trắng/chấm/gạch, có thể có "+84")
   * → coi là SĐT / 4 số cuối CCCD, so như 1 chuỗi số liền.
   */
  digits: string | null;
}

export function parseSearch(raw: string | undefined): ParsedSearch | null {
  const text = (raw ?? '').normalize('NFC').trim().slice(0, MAX_SEARCH_LENGTH);
  if (!text) return null;
  const compact = text.replace(/[\s.\-()]/g, '');
  if (/^\+?\d{3,}$/.test(compact)) {
    // "+84 912..." → "0912..." (SĐT lưu dạng 0xxxxxxxxx).
    const digits = compact.startsWith('+84')
      ? `0${compact.slice(3)}`
      : compact.replace(/^\+/, '');
    return { tokens: [digits], digits };
  }
  const tokens = text
    .split(/\s+/)
    .map((token) => token.replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS);
  return tokens.length ? { tokens, digits: null } : null;
}

/** Thoát ký tự đặc biệt của LIKE (\ % _) — dùng kèm `ESCAPE '\'`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `cột` chứa `token`, không phân biệt hoa thường + dấu. `column` là SQL tin cậy. */
export function unaccentContains(column: string, token: string): Prisma.Sql {
  return Prisma.sql`lower(f_unaccent(${Prisma.raw(column)})) LIKE '%' || lower(f_unaccent(${escapeLike(token)})) || '%' ESCAPE '\\'`;
}

/** `cột` (dạng ASCII như email, serial, id) chứa / bắt đầu bằng `token`. */
export function plainLike(
  column: string,
  token: string,
  mode: 'contains' | 'prefix',
): Prisma.Sql {
  const pattern =
    mode === 'prefix'
      ? `${escapeLike(token.toLowerCase())}%`
      : `%${escapeLike(token.toLowerCase())}%`;
  return Prisma.sql`lower(${Prisma.raw(column)}) LIKE ${pattern} ESCAPE '\\'`;
}

/** Ghép nhiều điều kiện bằng AND/OR; mảng rỗng → TRUE/FALSE tương ứng. */
export function joinSql(parts: Prisma.Sql[], op: 'AND' | 'OR'): Prisma.Sql {
  if (!parts.length)
    return Prisma.sql`${Prisma.raw(op === 'AND' ? 'TRUE' : 'FALSE')}`;
  return Prisma.sql`(${Prisma.join(parts, ` ${op} `)})`;
}

const VN_OFFSET = '+07:00';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Khoảng ngày theo GIỜ VIỆT NAM → mốc UTC [from 00:00, to+1 ngày 00:00).
 * Cột timestamp trong CSDL lưu giờ UTC (không múi giờ).
 */
export function vnDateRange(
  from?: string,
  to?: string,
): { start?: Date; end?: Date } {
  const parse = (value: string) => {
    const date = new Date(`${value}T00:00:00${VN_OFFSET}`);
    if (!DATE_ONLY.test(value) || Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Ngày không hợp lệ: ${value}`);
    }
    return date;
  };
  const start = from ? parse(from) : undefined;
  const end = to
    ? new Date(parse(to).getTime() + 24 * 60 * 60 * 1000)
    : undefined;
  if (start && end && start >= end) {
    throw new BadRequestException('"Từ ngày" phải trước hoặc bằng "Đến ngày"');
  }
  return { start, end };
}

/** Date → literal timestamp UTC (cột không múi giờ) cho Prisma.sql. */
export function utcTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`${date.toISOString().replace('Z', '')}::timestamp`;
}

/** Sắp xếp kết quả findMany theo đúng thứ tự id trả về từ câu SQL. */
export function orderByIds<T extends { id: string }>(
  rows: T[],
  ids: string[],
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is T => !!row);
}
