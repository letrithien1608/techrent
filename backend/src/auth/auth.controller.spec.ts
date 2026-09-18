import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Role } from '../generated/prisma/client';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refreshTokens: jest.Mock;
    logout: jest.Mock;
    changePassword: jest.Mock;
    addCccd: jest.Mock;
    verifyEmail: jest.Mock;
  };

  beforeEach(() => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      refreshTokens: jest.fn(),
      logout: jest.fn(),
      changePassword: jest.fn(),
      addCccd: jest.fn(),
      verifyEmail: jest.fn(),
    };
    controller = new AuthController(authService as unknown as AuthService);
  });

  it('register() gọi AuthService.register với đúng DTO', async () => {
    const dto = {
      name: 'A',
      email: 'a@example.com',
      password: 'Str0ngP@ssword',
      phone: '0901234567',
      cccd: '079203012345',
    };
    authService.register.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: {},
    });

    await controller.register(dto);

    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('login() gọi AuthService.login với đúng DTO', async () => {
    const dto = { email: 'a@example.com', password: 'Str0ngP@ssword' };
    authService.login.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: {},
    });

    await controller.login(dto);

    expect(authService.login).toHaveBeenCalledWith(dto);
  });

  it('refresh() gọi AuthService.refreshTokens với refreshToken trong body', async () => {
    authService.refreshTokens.mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
    });

    await controller.refresh({ refreshToken: 'old-refresh' });

    expect(authService.refreshTokens).toHaveBeenCalledWith('old-refresh');
  });

  it('logout() lấy access token từ header Authorization và gọi AuthService.logout', async () => {
    const req = { headers: { authorization: 'Bearer my-access-token' } } as any;
    const user = { userId: 'u1', email: 'a@example.com', role: Role.customer };

    await controller.logout(user, req);

    expect(authService.logout).toHaveBeenCalledWith('u1', 'my-access-token');
  });

  it('profile() trả về thẳng user lấy từ @CurrentUser()', () => {
    const user = { userId: 'u1', email: 'a@example.com', role: Role.customer };

    expect(controller.profile(user)).toBe(user);
  });

  it('changePassword() lấy access token từ header Authorization và gọi AuthService.changePassword với đúng userId + DTO', async () => {
    const req = { headers: { authorization: 'Bearer my-access-token' } } as any;
    const user = { userId: 'u1', email: 'a@example.com', role: Role.customer };
    const dto = { currentPassword: 'OldPass1', newPassword: 'NewPass1' };
    authService.changePassword.mockResolvedValue(undefined);

    const result = await controller.changePassword(user, dto, req);

    expect(authService.changePassword).toHaveBeenCalledWith(
      'u1',
      dto,
      'my-access-token',
    );
    expect(result).toEqual({ message: 'Đổi mật khẩu thành công' });
  });

  it('addCccd() gọi AuthService.addCccd với userId của người đang đăng nhập + DTO', async () => {
    const user = { userId: 'u1', email: 'a@example.com', role: Role.customer };
    const dto = { cccd: '079203012345' };
    authService.addCccd.mockResolvedValue({ id: 'u1', cccdMasked: '********2345' });

    const result = await controller.addCccd(user, dto);

    expect(authService.addCccd).toHaveBeenCalledWith('u1', dto);
    expect(result).toEqual({ id: 'u1', cccdMasked: '********2345' });
  });

  it('verifyEmail() gọi AuthService.verifyEmail với token trong query string', async () => {
    authService.verifyEmail.mockResolvedValue(undefined);

    const result = await controller.verifyEmail('some-token');

    expect(authService.verifyEmail).toHaveBeenCalledWith('some-token');
    expect(result).toEqual({ message: 'Xác thực email thành công' });
  });
});
