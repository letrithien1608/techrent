import { DeviceStatus } from '../generated/prisma/client';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let server: { emit: jest.Mock };

  beforeEach(() => {
    gateway = new RealtimeGateway();
    server = { emit: jest.fn() };
    gateway.server = server as any;
  });

  it('phát đúng event "device:status-changed" kèm đúng payload', () => {
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

  it('không throw khi client kết nối/ngắt kết nối', () => {
    const client = { id: 'socket-1' } as any;
    expect(() => gateway.handleConnection(client)).not.toThrow();
    expect(() => gateway.handleDisconnect(client)).not.toThrow();
  });
});
