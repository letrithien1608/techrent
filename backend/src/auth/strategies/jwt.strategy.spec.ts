import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '../../generated/prisma/client';
import { RedisService } from '../../redis/redis.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let redisService: { isTokenBlacklisted: jest.Mock };
  const payload = {
    sub: 'u1',
    email: 'a@example.com',
    role: Role.customer,
    jti: 'jti-1',
  };

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue('access-secret'),
    } as unknown as ConfigService;
    redisService = { isTokenBlacklisted: jest.fn() };
    strategy = new JwtStrategy(config, redisService as unknown as RedisService);
  });

  function reqWithToken(token: string) {
    return { headers: { authorization: `Bearer ${token}` } } as any;
  }

  it('trả về RequestUser rút gọn từ payload nếu token không nằm trong blacklist', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(false);

    const result = await strategy.validate(reqWithToken('good-token'), payload);

    expect(result).toEqual({
      userId: 'u1',
      email: 'a@example.com',
      role: Role.customer,
    });
  });

  it('ném UnauthorizedException nếu access token đã bị blacklist (sau logout)', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(true);

    await expect(
      strategy.validate(reqWithToken('revoked-token'), payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('gọi RedisService.isTokenBlacklisted đúng với token lấy từ header Authorization', async () => {
    redisService.isTokenBlacklisted.mockResolvedValue(false);

    await strategy.validate(reqWithToken('the-actual-token'), payload);

    expect(redisService.isTokenBlacklisted).toHaveBeenCalledWith(
      'the-actual-token',
    );
  });
});
