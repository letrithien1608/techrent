import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeviceStatus,
  MaintenanceStatus,
  Role,
} from '../generated/prisma/client';
import { MaintenanceService } from './maintenance.service';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let prisma: {
    $transaction: jest.Mock;
    device: { findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock };
    maintenance: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let realtimeGateway: { emitDeviceStatusChanged: jest.Mock };
  let notificationsService: { createForRoles: jest.Mock };
  let devicesCacheService: { invalidateAll: jest.Mock };

  const deviceId = 'device-1';
  const reporterId = 'staff-1';
  const baseRecord = {
    id: 'maint-1',
    deviceId,
    reportedBy: reporterId,
    issue: 'Màn hình bị vỡ',
    status: MaintenanceStatus.open,
    resolvedAt: null,
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
      device: { findUnique: jest.fn(), update: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Nhân viên B' }),
      },
      maintenance: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    realtimeGateway = { emitDeviceStatusChanged: jest.fn() };
    notificationsService = {
      createForRoles: jest.fn().mockResolvedValue(undefined),
    };
    devicesCacheService = {
      invalidateAll: jest.fn().mockResolvedValue(undefined),
    };
    service = new MaintenanceService(
      prisma as unknown as PrismaService,
      realtimeGateway as any,
      notificationsService as any,
      devicesCacheService as any,
    );
  });

  describe('create', () => {
    it('ném NotFoundException nếu thiết bị không tồn tại', async () => {
      prisma.device.findUnique.mockResolvedValue(null);
      await expect(
        service.create(reporterId, { deviceId, issue: 'Hỏng' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tạo bản ghi sự cố VÀ đổi Device.status sang maintenance', async () => {
      prisma.device.findUnique.mockResolvedValue({
        id: deviceId,
        name: 'MacBook Pro 14"',
        status: DeviceStatus.available,
      });
      prisma.maintenance.create.mockResolvedValue(baseRecord);
      prisma.device.update.mockResolvedValue({
        id: deviceId,
        status: DeviceStatus.maintenance,
      });

      const result = await service.create(reporterId, {
        deviceId,
        issue: 'Màn hình bị vỡ',
      });

      expect(result).toEqual(baseRecord);
      expect(prisma.maintenance.create).toHaveBeenCalledWith({
        data: { deviceId, reportedBy: reporterId, issue: 'Màn hình bị vỡ' },
      });
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { status: DeviceStatus.maintenance },
      });
      expect(realtimeGateway.emitDeviceStatusChanged).toHaveBeenCalledWith({
        deviceId,
        status: DeviceStatus.maintenance,
      });
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
      expect(notificationsService.createForRoles).toHaveBeenCalledWith(
        [Role.staff, Role.admin],
        expect.objectContaining({
          type: 'maintenance_reported',
          message: expect.stringContaining('MacBook Pro'),
          link: '/admin/maintenance',
        }),
        { excludeUserId: reporterId },
      );
    });

    it('vẫn tạo bản ghi thành công dù tạo thông báo cho staff/admin thất bại (chỉ log warning)', async () => {
      prisma.device.findUnique.mockResolvedValue({
        id: deviceId,
        name: 'MacBook Pro 14"',
        status: DeviceStatus.available,
      });
      prisma.maintenance.create.mockResolvedValue(baseRecord);
      prisma.device.update.mockResolvedValue({
        id: deviceId,
        status: DeviceStatus.maintenance,
      });
      notificationsService.createForRoles.mockRejectedValue(
        new Error('DB down'),
      );

      await expect(
        service.create(reporterId, { deviceId, issue: 'Màn hình bị vỡ' }),
      ).resolves.toEqual(baseRecord);
    });
  });

  describe('updateStatus', () => {
    it('ném NotFoundException nếu không tìm thấy bản ghi', async () => {
      prisma.maintenance.findUnique.mockResolvedValue(null);
      await expect(
        service.updateStatus('missing', MaintenanceStatus.in_progress),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ném BadRequestException nếu bản ghi đã resolved', async () => {
      prisma.maintenance.findUnique.mockResolvedValue({
        ...baseRecord,
        status: MaintenanceStatus.resolved,
      });
      await expect(
        service.updateStatus(baseRecord.id, MaintenanceStatus.open),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('open -> in_progress: chỉ đổi status, KHÔNG đụng Device', async () => {
      prisma.maintenance.findUnique.mockResolvedValue(baseRecord);
      prisma.maintenance.update.mockResolvedValue({
        ...baseRecord,
        status: MaintenanceStatus.in_progress,
      });

      const result = await service.updateStatus(
        baseRecord.id,
        MaintenanceStatus.in_progress,
      );

      expect(result.status).toBe(MaintenanceStatus.in_progress);
      expect(prisma.device.update).not.toHaveBeenCalled();
      expect(realtimeGateway.emitDeviceStatusChanged).not.toHaveBeenCalled();
    });

    it('-> resolved: set resolvedAt VÀ đưa Device.status về available', async () => {
      prisma.maintenance.findUnique.mockResolvedValue({
        ...baseRecord,
        status: MaintenanceStatus.in_progress,
      });
      prisma.maintenance.update.mockResolvedValue({
        ...baseRecord,
        status: MaintenanceStatus.resolved,
        resolvedAt: new Date(),
      });
      prisma.device.update.mockResolvedValue({
        id: deviceId,
        status: DeviceStatus.available,
      });

      const result = await service.updateStatus(
        baseRecord.id,
        MaintenanceStatus.resolved,
      );

      expect(result.status).toBe(MaintenanceStatus.resolved);
      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: deviceId },
        data: { status: DeviceStatus.available },
      });
      expect(realtimeGateway.emitDeviceStatusChanged).toHaveBeenCalledWith({
        deviceId,
        status: DeviceStatus.available,
      });
      expect(devicesCacheService.invalidateAll).toHaveBeenCalled();
    });
  });
});
