import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { translateUniqueConstraintError } from './prisma-error.util';

function makeP2002(target: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

describe('translateUniqueConstraintError', () => {
  it('dịch P2002 với target dạng MẢNG tên field thành ConflictException đúng message', () => {
    const result = translateUniqueConstraintError(makeP2002(['phone']), {
      phone: 'Số điện thoại đã được dùng',
      cccd: 'CCCD đã được dùng',
    });

    expect(result).toBeInstanceOf(ConflictException);
    expect((result as ConflictException).message).toBe(
      'Số điện thoại đã được dùng',
    );
  });

  it('dịch P2002 với target dạng CHUỖI tên constraint (VD "idx_users_cccd_hash")', () => {
    const result = translateUniqueConstraintError(
      makeP2002('idx_users_cccd_hash'),
      { phone: 'Số điện thoại đã được dùng', cccd: 'CCCD đã được dùng' },
    );

    expect(result).toBeInstanceOf(ConflictException);
    expect((result as ConflictException).message).toBe('CCCD đã được dùng');
  });

  it('trả nguyên lỗi gốc nếu KHÔNG phải P2002', () => {
    const otherError = new Error('lỗi khác không liên quan');

    expect(
      translateUniqueConstraintError(otherError, { phone: 'x' }),
    ).toBe(otherError);
  });

  it('trả nguyên lỗi gốc nếu P2002 nhưng target không khớp field nào đã khai báo', () => {
    const error = makeP2002(['email']);

    expect(
      translateUniqueConstraintError(error, { phone: 'x', cccd: 'y' }),
    ).toBe(error);
  });

  // Regression test — bug THẬT phát hiện qua curl thủ công (xem CLAUDE.md mục
  // 4): với Prisma 7 + @prisma/adapter-pg, `error.meta.target` KHÔNG TỒN TẠI,
  // tên constraint nằm ở `error.meta.driverAdapterError.cause.constraint.index`.
  // Nếu hàm chỉ đọc `meta.target` thì test này sẽ FAIL — chính là bug đã xảy ra.
  it('dịch đúng lỗi P2002 THẬT của Prisma 7 + adapter-pg (target nằm trong driverAdapterError, KHÔNG phải meta.target)', () => {
    const realShapeError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the constraint: `idx_users_phone`',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          // Đúng hệt shape thật quan sát được từ log lỗi live — KHÔNG có `target`.
          driverAdapterError: {
            cause: {
              originalCode: '23505',
              originalMessage:
                'duplicate key value violates unique constraint "idx_users_phone"',
              kind: 'UniqueConstraintViolation',
              constraint: { index: 'idx_users_phone' },
              table: 'users',
            },
          },
        },
      },
    );

    const result = translateUniqueConstraintError(realShapeError, {
      phone: 'Số điện thoại đã được dùng',
      cccd: 'CCCD đã được dùng',
    });

    expect(result).toBeInstanceOf(ConflictException);
    expect((result as ConflictException).message).toBe(
      'Số điện thoại đã được dùng',
    );
  });
});
