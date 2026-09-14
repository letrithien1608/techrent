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
