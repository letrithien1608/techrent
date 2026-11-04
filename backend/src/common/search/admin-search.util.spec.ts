import { BadRequestException } from '@nestjs/common';
import {
  escapeLike,
  parseSearch,
  toBoolQuery,
  vnDateRange,
} from './admin-search.util';

describe('parseSearch', () => {
  it('rỗng / toàn khoảng trắng → null', () => {
    expect(parseSearch(undefined)).toBeNull();
    expect(parseSearch('   ')).toBeNull();
  });

  it('tách từ, bỏ dấu # của mã đơn, giữ nguyên dấu tiếng Việt (Postgres tự bỏ)', () => {
    expect(parseSearch('  Nguyễn   Văn An ')).toEqual({
      tokens: ['Nguyễn', 'Văn', 'An'],
      digits: null,
    });
    expect(parseSearch('#AB12CD')).toEqual({
      tokens: ['AB12CD'],
      digits: null,
    });
  });

  it('chuỗi toàn số (có khoảng trắng, chấm, gạch, +84) → SĐT dạng 0xxxxxxxxx', () => {
    expect(parseSearch('0901 234.567')?.digits).toBe('0901234567');
    expect(parseSearch('+84 901-234-567')?.digits).toBe('0901234567');
    expect(parseSearch('1234')?.digits).toBe('1234');
    // Quá ngắn để coi là số điện thoại → tìm như chữ bình thường.
    expect(parseSearch('12')).toEqual({ tokens: ['12'], digits: null });
  });

  it('giới hạn độ dài và số từ', () => {
    const parsed = parseSearch('a b c d e f g h');
    expect(parsed?.tokens).toHaveLength(6);
    expect(parseSearch('x'.repeat(500))?.tokens[0]).toHaveLength(100);
  });

  it('chuẩn hoá NFC (chữ có dấu gõ dạng tổ hợp)', () => {
    const decomposed = 'Nguyễn';
    expect(parseSearch(decomposed)?.tokens[0]).toBe('Nguyễn');
  });
});

describe('escapeLike', () => {
  it('thoát %, _ và \\ để từ khoá không thành ký tự đại diện', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });
});

describe('vnDateRange', () => {
  it('ngày theo giờ VN: 05/11 00:00 (+07) = 04/11 17:00 UTC, "đến ngày" tính trọn ngày', () => {
    const { start, end } = vnDateRange('2026-11-05', '2026-11-06');
    expect(start?.toISOString()).toBe('2026-11-04T17:00:00.000Z');
    expect(end?.toISOString()).toBe('2026-11-06T17:00:00.000Z');
  });

  it('chỉ 1 đầu mút', () => {
    expect(vnDateRange('2026-11-05').end).toBeUndefined();
    expect(vnDateRange(undefined, '2026-11-05').start).toBeUndefined();
  });

  it('ngày không tồn tại hoặc từ > đến → 400', () => {
    expect(() => vnDateRange('2026-13-40')).toThrow(BadRequestException);
    expect(() => vnDateRange('2026-11-06', '2026-11-05')).toThrow(
      BadRequestException,
    );
  });
});

describe('toBoolQuery', () => {
  it('chỉ "true"/"false" được đổi, giá trị khác giữ nguyên để validator báo lỗi', () => {
    expect(toBoolQuery({ value: 'true' })).toBe(true);
    expect(toBoolQuery({ value: 'false' })).toBe(false);
    expect(toBoolQuery({ value: 'yes' })).toBe('yes');
  });
});
