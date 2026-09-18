import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

/**
 * Prisma ném `PrismaClientKnownRequestError` (code P2002) khi vi phạm unique
 * constraint — message mặc định rất kỹ thuật, KHÔNG nên trả thẳng cho người
 * dùng. Hàm này dịch sang message tiếng Việt thân thiện dựa theo tên cột/
 * constraint bị vi phạm.
 *
 * Đây là lớp bảo vệ CUỐI CÙNG chống race condition (2 request cùng lúc dùng
 * chung 1 giá trị) — dùng SAU khi đã có validate/pre-check ở tầng ứng dụng,
 * không thay thế cho pre-check khi cần message tức thời rõ ràng hơn.
 *
 * ⚠️ **Đã xác nhận bằng lỗi THẬT** (không phải suy đoán): với Prisma 7 +
 * driver adapter `@prisma/adapter-pg` (bắt buộc từ Tuần 3, xem CLAUDE.md mục
 * 2), `error.meta.target` KHÔNG TỒN TẠI như các bản Prisma cũ/provider khác —
 * tên constraint nằm ở `error.meta.driverAdapterError.cause.constraint.index`
 * (VD `"idx_users_phone"`). Nếu chỉ đọc `meta.target` (cách "chuẩn" theo tài
 * liệu Prisma cho các adapter khác) thì hàm này LUÔN rơi vào nhánh "không
 * khớp field nào" và trả về lỗi Prisma thô → NestJS tự set 500 "Internal
 * server error", KHÔNG bao giờ tới được `ConflictException` — bug này đã xảy
 * ra thật khi test tay bằng curl (đăng ký trùng phone), xem CLAUDE.md mục 4.
 * Để không phụ thuộc mãi vào 1 hình dạng cụ thể (có thể đổi giữa các bản
 * Prisma), hàm này gom TẤT CẢ vị trí có khả năng chứa tên field/constraint —
 * `meta.target`, `meta.driverAdapterError.cause.constraint.index`/`.fields`,
 * và cả `error.message` thô — rồi so khớp CHUỖI CON (substring), miễn tên
 * field/cột/constraint đều chứa đúng từ khoá đặt tên nhất quán trong schema.
 */
export function translateUniqueConstraintError(
  error: unknown,
  fieldMessages: Record<string, string>,
): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const haystack = collectPossibleConstraintStrings(error).join(' | ');

    for (const [key, message] of Object.entries(fieldMessages)) {
      if (haystack.includes(key.toLowerCase())) {
        return new ConflictException(message);
      }
    }
  }
  return error;
}

function collectPossibleConstraintStrings(
  error: Prisma.PrismaClientKnownRequestError,
): string[] {
  const values: unknown[] = [error.message, error.meta?.target];

  // Prisma 7 + @prisma/adapter-pg: tên constraint thật nằm trong lỗi driver
  // gốc (`DriverAdapterError`), KHÔNG phải `meta.target` — xem ghi chú trên.
  const driverError = error.meta?.driverAdapterError as
    | { cause?: { constraint?: { index?: unknown; fields?: unknown } } }
    | undefined;
  values.push(driverError?.cause?.constraint?.index);
  values.push(driverError?.cause?.constraint?.fields);

  return values.flatMap((value) => {
    if (typeof value === 'string') return [value.toLowerCase()];
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string').map((v) => v.toLowerCase());
    }
    return [];
  });
}
