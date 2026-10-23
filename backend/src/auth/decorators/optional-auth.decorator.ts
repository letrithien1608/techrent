import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * Route cho phép cả khách CHƯA đăng nhập: có access token hợp lệ thì gán
 * `req.user` như bình thường (để rate limit theo user), thiếu/sai/hết hạn thì
 * coi là khách vãng lai thay vì trả 401 — khác `@Public()` (bỏ qua hẳn JWT).
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
