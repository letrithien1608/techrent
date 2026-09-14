import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../generated/prisma/client';
import { RolesGuard } from './roles.guard';

function createContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('cho qua nếu route không gắn @Roles()', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext(undefined))).toBe(true);
  });

  it('cho qua nếu role của user nằm trong danh sách @Roles() yêu cầu', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.admin, Role.staff]);

    const result = guard.canActivate(
      createContext({ userId: 'u1', role: Role.staff }),
    );

    expect(result).toBe(true);
  });

  it('ném ForbiddenException nếu role của user không nằm trong @Roles() yêu cầu', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.admin]);

    expect(() =>
      guard.canActivate(createContext({ userId: 'u1', role: Role.customer })),
    ).toThrow(ForbiddenException);
  });

  it('ném ForbiddenException nếu route yêu cầu role nhưng request chưa có user (chưa đăng nhập)', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.admin]);

    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
