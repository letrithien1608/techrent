import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import {
  BookingStatus,
  DepositRefundStatus,
  Device,
  DeviceIssueReport,
  DeviceStatus,
  InspectionType,
  IssueReportStatus,
  IssueResolution,
  Prisma,
} from '../generated/prisma/client';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import {
  calculateUnusedRentalRefund,
  depositRefundDueAt,
  HANDOVER_MIN_PHOTOS,
  isEquivalentValue,
} from '../common/business-policy';
import { BookingsService, UploadedImage } from './bookings.service';
import { ResolveIssueDto } from './dto/resolve-issue.dto';

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.pending,
  BookingStatus.confirmed,
  BookingStatus.ongoing,
];

const issueWithBooking = {
  include: {
    booking: {
      include: {
        device: {
          select: { id: true, name: true, images: true, categoryId: true },
        },
        user: { select: { id: true, name: true, phone: true } },
      },
    },
  },
} satisfies Prisma.DeviceIssueReportDefaultArgs;

export type IssueReportWithBooking = Prisma.DeviceIssueReportGetPayload<
  typeof issueWithBooking
>;

export interface ReplacementCandidate {
  id: string;
  name: string;
  images: string[];
  originalPrice: number;
  pricePerDay: number;
}

/**
 * Máy hỏng giữa kỳ thuê: khách báo lỗi từ đơn đang thuê, nhân viên xử lý theo
 * 1 trong 3 hướng — đổi máy tương đương, kết thúc sớm (hoàn tiền thuê phần
 * chưa dùng + đủ cọc), hoặc lỗi do khách (ghi chi phí sửa, trừ vào cọc khi trả).
 */
@Injectable()
export class BookingIssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly bookingsService: BookingsService,
  ) {}

  /** Khách báo lỗi (chỉ chủ đơn, đơn đang thuê, mỗi lúc 1 báo lỗi chưa xử lý). */
  async report(
    bookingId: string,
    currentUser: RequestUser,
    description: string,
    files: UploadedImage[],
  ): Promise<DeviceIssueReport> {
    const booking = await this.bookingsService.findByIdOrThrow(bookingId);
    if (booking.userId !== currentUser.userId) {
      throw new ForbiddenException('Bạn chỉ báo lỗi được cho đơn của mình');
    }
    if (booking.status !== BookingStatus.ongoing) {
      throw new BadRequestException('Chỉ báo lỗi thiết bị cho đơn đang thuê');
    }
    const open = await this.prisma.deviceIssueReport.findFirst({
      where: { bookingId, status: IssueReportStatus.open },
    });
    if (open) {
      throw new ConflictException(
        'Đơn này đang có 1 báo lỗi chờ cửa hàng xử lý',
      );
    }
    const media = files.length
      ? await this.uploadService.uploadIssueMedia(files, bookingId)
      : [];
    const report = await this.prisma.deviceIssueReport.create({
      data: {
        bookingId,
        reportedById: currentUser.userId,
        deviceId: booking.deviceId,
        description: description.trim(),
        media,
      },
    });
    await this.bookingsService.notifyStaff(bookingId, {
      kind: 'issue_reported',
      reportId: report.id,
      description: report.description,
    });
    return report;
  }

  async findAll(filter: {
    status?: IssueReportStatus;
    page: number;
    limit: number;
  }) {
    const where: Prisma.DeviceIssueReportWhereInput = filter.status
      ? { status: filter.status }
      : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.deviceIssueReport.findMany({
        where,
        orderBy: { createdAt: filter.status === 'open' ? 'asc' : 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        ...issueWithBooking,
      }),
      this.prisma.deviceIssueReport.count({ where }),
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

  async findOne(id: string): Promise<IssueReportWithBooking> {
    const report = await this.prisma.deviceIssueReport.findUnique({
      where: { id },
      ...issueWithBooking,
    });
    if (!report) throw new NotFoundException('Không tìm thấy báo lỗi');
    return report;
  }

  /**
   * Máy thay thế: cùng danh mục, đang sẵn sàng, chưa ngừng kinh doanh, giá
   * trị tương đương (REPLACEMENT_VALUE_TOLERANCE) và TRỐNG LỊCH trên toàn bộ
   * khung giờ của đơn (đúng phạm vi exclusion constraint sẽ kiểm tra).
   */
  async findReplacementCandidates(
    bookingId: string,
  ): Promise<ReplacementCandidate[]> {
    const booking = await this.bookingsService.findByIdOrThrow(bookingId);
    const current = await this.prisma.device.findUniqueOrThrow({
      where: { id: booking.deviceId },
    });
    const devices = await this.prisma.device.findMany({
      where: {
        categoryId: current.categoryId,
        id: { not: current.id },
        status: DeviceStatus.available,
        isDiscontinued: false,
        bookings: {
          none: {
            id: { not: bookingId },
            status: { in: ACTIVE_BOOKING_STATUSES },
            startTime: { lt: booking.endTime },
            endTime: { gt: booking.startTime },
          },
        },
      },
    });
    const originalPrice = Number(current.originalPrice);
    return devices
      .filter((d) => isEquivalentValue(originalPrice, Number(d.originalPrice)))
      .sort(
        (a, b) =>
          Math.abs(Number(a.originalPrice) - originalPrice) -
          Math.abs(Number(b.originalPrice) - originalPrice),
      )
      .map((d) => ({
        id: d.id,
        name: d.name,
        images: d.images,
        originalPrice: Number(d.originalPrice),
        pricePerDay: Number(d.pricePerDay),
      }));
  }

  async resolve(
    reportId: string,
    actorId: string,
    dto: ResolveIssueDto,
    files: UploadedImage[],
  ): Promise<IssueReportWithBooking> {
    const report = await this.findOne(reportId);
    if (report.status !== IssueReportStatus.open) {
      throw new BadRequestException('Báo lỗi này đã được xử lý');
    }
    if (report.booking.status !== BookingStatus.ongoing) {
      throw new BadRequestException(
        'Đơn thuê không còn ở trạng thái đang thuê',
      );
    }
    const note = dto.note?.trim() || null;
    switch (dto.resolution) {
      case IssueResolution.swapped:
        await this.swapDevice(report, actorId, dto, files, note);
        break;
      case IssueResolution.ended_early:
        await this.endEarly(report, actorId, note);
        break;
      case IssueResolution.customer_fault:
        await this.chargeCustomerFault(report, actorId, dto, note);
        break;
    }
    return this.findOne(reportId);
  }

  /**
   * Đổi máy — cùng cơ chế chống đặt trùng với luồng đặt thuê: transaction +
   * SELECT ... FOR UPDATE khoá cả 2 dòng thiết bị (theo thứ tự id để tránh
   * deadlock), kiểm tra trùng lịch máy mới, exclusion constraint là lớp cuối.
   */
  private async swapDevice(
    report: IssueReportWithBooking,
    actorId: string,
    dto: ResolveIssueDto,
    files: UploadedImage[],
    note: string | null,
  ): Promise<void> {
    const booking = report.booking;
    const newDeviceId = dto.replacementDeviceId;
    if (!newDeviceId) {
      throw new BadRequestException('Vui lòng chọn máy thay thế');
    }
    if (newDeviceId === booking.deviceId) {
      throw new BadRequestException('Máy thay thế phải khác máy đang thuê');
    }
    if (files.length < HANDOVER_MIN_PHOTOS) {
      throw new BadRequestException(
        `Cần tối thiểu ${HANDOVER_MIN_PHOTOS} ảnh tình trạng máy thay thế (biên bản giao máy mới)`,
      );
    }
    const images = await this.uploadService.uploadInspectionImages(
      files,
      booking.id,
      InspectionType.handover,
    );

    let newDevice: Device;
    try {
      newDevice = await this.prisma.$transaction(async (tx) => {
        const lockOrder = [booking.deviceId, newDeviceId].sort();
        for (const id of lockOrder) {
          await tx.$queryRaw`SELECT id FROM devices WHERE id::text = ${id} FOR UPDATE`;
        }
        const fresh = await tx.booking.findUniqueOrThrow({
          where: { id: booking.id },
        });
        if (fresh.status !== BookingStatus.ongoing) {
          throw new BadRequestException(
            'Đơn thuê không còn ở trạng thái đang thuê',
          );
        }
        const [oldDevice, candidate] = await Promise.all([
          tx.device.findUniqueOrThrow({ where: { id: fresh.deviceId } }),
          tx.device.findUnique({ where: { id: newDeviceId } }),
        ]);
        if (!candidate)
          throw new NotFoundException('Không tìm thấy máy thay thế');
        if (
          candidate.categoryId !== oldDevice.categoryId ||
          candidate.status !== DeviceStatus.available ||
          candidate.isDiscontinued ||
          !isEquivalentValue(
            Number(oldDevice.originalPrice),
            Number(candidate.originalPrice),
          )
        ) {
          throw new BadRequestException(
            'Máy thay thế phải cùng danh mục, đang sẵn sàng và có giá trị tương đương',
          );
        }
        const overlapping = await tx.booking.findFirst({
          where: {
            deviceId: newDeviceId,
            id: { not: fresh.id },
            status: { in: ACTIVE_BOOKING_STATUSES },
            startTime: { lt: fresh.endTime },
            endTime: { gt: fresh.startTime },
          },
        });
        if (overlapping) {
          throw new ConflictException(
            'Máy thay thế đã có lịch đặt trong thời gian thuê của đơn này',
          );
        }

        const handover = await tx.bookingInspection.findUnique({
          where: {
            bookingId_type: {
              bookingId: fresh.id,
              type: InspectionType.handover,
            },
          },
        });
        await tx.booking.update({
          where: { id: fresh.id },
          data: { deviceId: newDeviceId },
        });
        await tx.device.update({
          where: { id: oldDevice.id },
          data: { status: DeviceStatus.maintenance },
        });
        await tx.device.update({
          where: { id: newDeviceId },
          data: { status: DeviceStatus.rented },
        });
        await tx.maintenance.create({
          data: {
            deviceId: oldDevice.id,
            reportedBy: actorId,
            issue: `Khách báo lỗi giữa kỳ thuê (đã đổi máy): ${report.description}`,
          },
        });
        const handoverData = {
          images,
          notes: `Máy thay thế cho ${oldDevice.name} (đổi máy do lỗi thiết bị).`,
          performedById: actorId,
        };
        await tx.bookingInspection.upsert({
          where: {
            bookingId_type: {
              bookingId: fresh.id,
              type: InspectionType.handover,
            },
          },
          create: {
            bookingId: fresh.id,
            type: InspectionType.handover,
            ...handoverData,
          },
          update: { ...handoverData, createdAt: new Date() },
        });
        await tx.deviceIssueReport.update({
          where: { id: report.id },
          data: {
            status: IssueReportStatus.resolved,
            resolution: IssueResolution.swapped,
            replacementDeviceId: newDeviceId,
            previousHandoverImages: handover?.images ?? [],
            resolutionNote: note,
            resolvedById: actorId,
            resolvedAt: new Date(),
          },
        });
        return candidate;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (
        message.includes('no_overlapping_bookings') ||
        message.includes('23P01')
      ) {
        throw new ConflictException(
          'Máy thay thế đã có lịch đặt trong thời gian thuê của đơn này',
        );
      }
      throw error;
    }

    await this.bookingsService.afterDeviceStatusChanged(
      booking.deviceId,
      DeviceStatus.maintenance,
    );
    await this.bookingsService.afterDeviceStatusChanged(
      newDevice.id,
      DeviceStatus.rented,
    );
    const updated = await this.bookingsService.findByIdOrThrow(booking.id);
    // Hợp đồng ghi máy mới + Phụ lục đổi thiết bị (trạng thái ký giữ nguyên).
    await this.bookingsService.refreshContractSnapshot(booking.id);
    await this.bookingsService.notifyCustomer(updated, {
      kind: 'issue_resolved',
      resolution: 'swapped',
      replacementDeviceName: newDevice.name,
      note,
    });
  }

  /** Kết thúc sớm do lỗi thiết bị: hoàn tiền thuê phần chưa dùng + hoàn đủ cọc. */
  private async endEarly(
    report: IssueReportWithBooking,
    actorId: string,
    note: string | null,
  ): Promise<void> {
    const booking = report.booking;
    const endedAt = new Date();
    const rentalRefund = calculateUnusedRentalRefund({
      totalPrice: Number(booking.totalPrice),
      startTime: booking.startTime,
      endTime: booking.endTime,
      endedAt,
    });
    const depositRefund = Number(booking.depositAmount);
    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          status: BookingStatus.completed,
          returnedAt: endedAt,
          rentalRefundAmount: rentalRefund,
          depositRefundAmount: depositRefund,
          depositRefundStatus: DepositRefundStatus.pending,
          depositRefundDueAt: depositRefundDueAt(endedAt),
        },
      }),
      this.prisma.device.update({
        where: { id: booking.deviceId },
        data: { status: DeviceStatus.maintenance },
      }),
      this.prisma.maintenance.create({
        data: {
          deviceId: booking.deviceId,
          reportedBy: actorId,
          issue: `Khách báo lỗi giữa kỳ thuê (kết thúc sớm): ${report.description}`,
        },
      }),
      this.prisma.deviceIssueReport.update({
        where: { id: report.id },
        data: {
          status: IssueReportStatus.resolved,
          resolution: IssueResolution.ended_early,
          rentalRefundAmount: rentalRefund,
          resolutionNote: note,
          resolvedById: actorId,
          resolvedAt: endedAt,
        },
      }),
    ]);
    await this.bookingsService.afterDeviceStatusChanged(
      booking.deviceId,
      DeviceStatus.maintenance,
    );
    await this.bookingsService.refreshContractSnapshot(booking.id);
    await this.bookingsService.notifyCustomer(booking, {
      kind: 'issue_resolved',
      resolution: 'ended_early',
      rentalRefund,
      depositRefund,
      note,
    });
  }

  /** Lỗi do khách: ghi chi phí sửa vào đơn, trừ vào cọc ở bước trả máy. */
  private async chargeCustomerFault(
    report: IssueReportWithBooking,
    actorId: string,
    dto: ResolveIssueDto,
    note: string | null,
  ): Promise<void> {
    const repairCost = dto.repairCost ?? 0;
    if (repairCost <= 0) {
      throw new BadRequestException('Vui lòng nhập chi phí sửa chữa');
    }
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: report.booking.deviceId },
    });
    if (repairCost > Number(device.originalPrice)) {
      throw new BadRequestException(
        'Chi phí sửa chữa không được vượt quá giá trị thiết bị',
      );
    }
    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: report.bookingId },
        data: { repairFeeAmount: { increment: repairCost } },
      }),
      this.prisma.deviceIssueReport.update({
        where: { id: report.id },
        data: {
          status: IssueReportStatus.resolved,
          resolution: IssueResolution.customer_fault,
          repairCost,
          resolutionNote: note,
          resolvedById: actorId,
          resolvedAt: new Date(),
        },
      }),
    ]);
    await this.bookingsService.notifyCustomer(report.booking, {
      kind: 'issue_resolved',
      resolution: 'customer_fault',
      repairCost,
      note,
    });
  }
}
