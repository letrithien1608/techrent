import { Role } from '../../generated/prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Định danh duy nhất của lần cấp token — đảm bảo mỗi token khác nhau kể cả khi cấp trong cùng 1 giây. */
  jti: string;
}

export interface RequestUser {
  userId: string;
  email: string;
  role: Role;
}

/**
 * Payload riêng cho token xác thực email — ký bằng EMAIL_VERIFICATION_SECRET
 * (khác secret access/refresh) và có `purpose` để không thể dùng nhầm access
 * token vào chỗ này hay ngược lại.
 */
export interface EmailVerificationPayload {
  sub: string;
  purpose: 'email-verification';
}
