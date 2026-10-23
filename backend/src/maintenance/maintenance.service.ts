import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesCacheService } from '../devices/devices-cache.service';
import { buildMaintenanceNotification } from '../notifications/notification-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import {
  DeviceStatus,
  Maintenance,
  MaintenanceStatus,
  Prisma,
  Role,
} from '../generated/prisma/client';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ListMaintenanceFilter {
  page: number;
  limit: number;
  status?: MaintenanceStatus;
  deviceId?: string;
}

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
    private readonly devicesCacheService: DevicesCacheService,
  ) {}

  /** Staff/admin ghi nhận sự cố thiết bị — đổi Device.status sang `maintenance` ngay. */
  async create(
    reportedBy: string,
    dto: CreateMaintenanceDto,
  ): Promise<Maintenance> {
    const device = await this.prisma.device.findUnique({
      where: { id: dto.deviceId },
    });
    if (!device) {
      throw new NotFoundException('Không tìm thấy thiết bị');
    }

    const [record] = await this.prisma.$transaction([
      this.prisma.maintenance.create({
        data: { deviceId: dto.deviceId, reportedBy, issue: dto.issue },
      }),
      this.prisma.device.update({
        where: { id: dto.deviceId },
        data: { status: DeviceStatus.maintenance },
      }),
    ]);

    this.realtimeGateway.emitDeviceStatusChanged({
      deviceId: dto.deviceId,
      status: DeviceStatus.maintenance,
    });
    await this.devicesCacheService.invalidateAll();

    // Thông báo cho TOÀN BỘ staff/admin (trừ chính người vừa báo hỏng — họ
    // đã biết, không cần tự thông báo cho mình) có sự cố mới cần xử lý.
    try {
      const reporter = await this.prisma.user.findUnique({
        where: { id: reportedBy },
        select: { name: true },
      });
      await this.notificationsService.createForRoles(
        [Role.staff, Role.admin],
        buildMaintenanceNotification({
          maintenanceId: record.id,
          device,
          issue: dto.issue,
          reporterName: reporter?.name ?? null,
        }),
        { excludeUserId: reportedBy },
      );
    } catch (error) {
      this.logger.warn(
        `Không tạo được thông báo báo hỏng cho staff/admin (maintenance ${record.id}): ${(error as Error).message}`,
      );
    }

    return record;
  }

  async findAll(
    filter: ListMaintenanceFilter,
  ): Promise<PaginatedResult<Maintenance>> {
    const where: Prisma.MaintenanceWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.deviceId ? { deviceId: filter.deviceId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.maintenance.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.maintenance.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: filter.page,
        limit: filter.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filter.limit)),
      },
    };
  }

  async findByIdOrThrow(id: string): Promise<Maintenance> {
    const record = await this.prisma.maintenance.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('Không tìm thấy báo cáo sự cố');
    }
    return record;
  }

  /** `resolved` -> đưa thiết bị trở lại `available` (giả định đã sửa xong, không còn `broken`). */
  async updateStatus(
    id: string,
    status: MaintenanceStatus,
  ): Promise<Maintenance> {
    const record = await this.findByIdOrThrow(id);
    if (record.status === MaintenanceStatus.resolved) {
      throw new BadRequestException(
        'Báo cáo sự cố đã ở trạng thái "resolved", không thể cập nhật thêm',
      );
    }

    if (status !== MaintenanceStatus.resolved) {
      return this.prisma.maintenance.update({
        where: { id },
        data: { status },
      });
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.maintenance.update({
        where: { id },
        data: { status: MaintenanceStatus.resolved, resolvedAt: new Date() },
      }),
      this.prisma.device.update({
        where: { id: record.deviceId },
        data: { status: DeviceStatus.available },
      }),
    ]);
    this.realtimeGateway.emitDeviceStatusChanged({
      deviceId: record.deviceId,
      status: DeviceStatus.available,
    });
    await this.devicesCacheService.invalidateAll();
    return updated;
  }
}
