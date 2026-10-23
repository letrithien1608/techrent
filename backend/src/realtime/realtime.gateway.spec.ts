import { DeviceStatus } from '../generated/prisma/client';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let server: { emit: jest.Mock; to: jest.Mock };
  let toEmit: jest.Mock;
  let jwtService: { verifyAsync: jest.Mock };
  let configService: { get: jest.Mock };

  function makeClient() {
    return {
      id: 'socket-1',
      data: {} as Record<string, unknown>,
      handshake: { auth: {} as Record<string, unknown> },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn(),
    };
  }

  beforeEach(() => {
    toEmit = jest.fn();
    server = {
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: toEmit }),
    };
    jwtService = { verifyAsync: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('secret') };
    gateway = new RealtimeGateway(jwtService as any, configService as any);
    gateway.server = server as any;
  });

  it('phát đúng event "device:status-changed" (broadcast toàn cục) kèm đúng payload', () => {
    gateway.emitDeviceStatusChanged({
      deviceId: 'device-1',
      status: DeviceStatus.rented,
    });

    expect(server.emit).toHaveBeenCalledTimes(1);
    expect(server.emit).toHaveBeenCalledWith('device:status-changed', {
      deviceId: 'device-1',
      status: DeviceStatus.rented,
    });
  });

  it('phát "notification:created" CHỈ tới room của đúng user sở hữu', () => {
    const payload = {
      id: 'notif-1',
      type: 'booking_confirmed',
      title: 'Đơn thuê đã được xác nhận',
      message: 'Đơn của bạn đã được xác nhận',
      link: '/bookings/b-1',
      metadata: { bookingId: 'b-1' },
      isRead: false,
      createdAt: new Date(),
    };

    gateway.emitNotificationCreated('user-1', payload);

    expect(server.to).toHaveBeenCalledWith('user:user-1');
    expect(toEmit).toHaveBeenCalledWith('notification:created', payload);
  });

  it('handleConnection join đúng room user:<sub> nếu handshake có token hợp lệ', async () => {
    const client = makeClient();
    client.handshake.auth.token = 'valid-token';
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1' });

    await gateway.handleConnection(client as any);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token', {
      secret: 'secret',
    });
    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.data.userId).toBe('user-1');
  });

  it('handleConnection KHÔNG throw và không join room nào nếu không có token', async () => {
    const client = makeClient();
    await expect(
      gateway.handleConnection(client as any),
    ).resolves.toBeUndefined();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('handleConnection KHÔNG throw nếu token sai/hết hạn (verifyAsync reject)', async () => {
    const client = makeClient();
    client.handshake.auth.token = 'bad-token';
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid token'));

    await expect(
      gateway.handleConnection(client as any),
    ).resolves.toBeUndefined();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('notifications:authenticate rời room CŨ trước khi join room MỚI', async () => {
    const client = makeClient();
    client.data.userId = 'user-old';
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-new' });

    await gateway.handleAuthenticate(client as any, { token: 'new-token' });

    expect(client.leave).toHaveBeenCalledWith('user:user-old');
    expect(client.join).toHaveBeenCalledWith('user:user-new');
    expect(client.data.userId).toBe('user-new');
  });

  it('notifications:logout rời đúng room hiện tại', () => {
    const client = makeClient();
    client.data.userId = 'user-1';

    gateway.handleLogout(client as any);

    expect(client.leave).toHaveBeenCalledWith('user:user-1');
    expect(client.data.userId).toBeUndefined();
  });

  it('không throw khi client ngắt kết nối', () => {
    const client = makeClient();
    expect(() => gateway.handleDisconnect(client as any)).not.toThrow();
  });
});
