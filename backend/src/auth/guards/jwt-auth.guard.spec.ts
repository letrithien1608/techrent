import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

function createContext(): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: JwtAuthGuard;
  let parentCanActivate: jest.SpyInstance;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(reflector as unknown as Reflector);

    // JwtAuthGuard extends AuthGuard('jwt') — spy lên canActivate của lớp cha để không
    // phải khởi động thật bộ máy Passport/JWT trong unit test này.
    const parentPrototype = Object.getPrototypeOf(JwtAuthGuard.prototype);
    parentCanActivate = jest
      .spyOn(parentPrototype, 'canActivate')
      .mockReturnValue(true);
  });

  afterEach(() => {
    parentCanActivate.mockRestore();
  });

  it('bỏ qua xác thực JWT (trả về true ngay) nếu route gắn @Public()', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    const result = guard.canActivate(createContext());

    expect(result).toBe(true);
    expect(parentCanActivate).not.toHaveBeenCalled();
  });

  it('uỷ quyền cho AuthGuard(jwt) gốc xác thực nếu route KHÔNG phải @Public()', () => {
    reflector.getAllAndOverride.mockReturnValue(false);

    const result = guard.canActivate(createContext());

    expect(result).toBe(true);
    expect(parentCanActivate).toHaveBeenCalledTimes(1);
  });
});
