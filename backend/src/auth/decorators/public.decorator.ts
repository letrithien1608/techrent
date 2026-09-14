import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Đánh dấu route không yêu cầu access token (bỏ qua JwtAuthGuard toàn cục). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
