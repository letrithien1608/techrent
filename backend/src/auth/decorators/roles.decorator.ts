import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/** Giới hạn route theo role: customer/staff/admin (mục 4.3 Roadmap). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
