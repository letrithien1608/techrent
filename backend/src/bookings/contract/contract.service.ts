import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import {
  BookingStatus,
  DeviceCondition,
  InspectionType,
  IssueResolution,
  PaymentStatus,
  RentalPaymentMethod,
} from '../../generated/prisma/client';
import { describeRentalPricing } from '../../common/business-policy';
import { getStoreInfo } from '../../common/store-info';
import { loadContractFontCss } from './contract-fonts';
import {
  type ContractAccessory,
  type ContractData,
  renderContractHtml,
} from './contract-html';
import { ContractPdfService } from './contract-pdf.service';

const CONDITION_LABEL: Record<DeviceCondition, string> = {
  intact: 'Nguyên vẹn, đủ phụ kiện',
  damaged: 'Hư hỏng',
  missing_accessories: 'Thiếu phụ kiện',
};

const PAYMENT_METHOD_LABEL: Record<RentalPaymentMethod, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
};

function parseAccessories(value: unknown): ContractAccessory[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (a): a is ContractAccessory =>
        !!a &&
        typeof (a as ContractAccessory).name === 'string' &&
        typeof (a as ContractAccessory).quantity === 'number',
    )
    .map((a) => ({ name: a.name, quantity: a.quantity }));
}

/**
 * Hợp đồng thuê: gom dữ liệu đơn + thiết bị + khách + biên bản giao/nhận +
 * đổi máy + thanh toán thành ContractData rồi dựng HTML (contract-html.ts).
 * Bản in/PDF (staff/admin) có CCCD ĐẦY ĐỦ, sinh tạm mỗi lần gọi; bản lưu DB
 * (`Booking.contractContent`) luôn CCCD CHE và không nhúng font.
 */
@Injectable()
export class ContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly pdfService: ContractPdfService,
  ) {}

  async buildData(
    bookingId: string,
    options: { fullCccd: boolean; actorId?: string },
  ): Promise<ContractData> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        device: { include: { category: { select: { name: true } } } },
        user: true,
        inspections: true,
        issueReports: { orderBy: { createdAt: 'asc' } },
        payments: {
          where: {
            status: { in: [PaymentStatus.success, PaymentStatus.refunded] },
          },
          orderBy: { paidAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!booking) throw new NotFoundException('Không tìm thấy booking');

    const swaps = booking.issueReports.filter(
      (r) => r.resolution === IssueResolution.swapped && r.replacementDeviceId,
    );
    const endedEarly = booking.issueReports.find(
      (r) => r.resolution === IssueResolution.ended_early,
    );
    const handover = booking.inspections.find(
      (i) => i.type === InspectionType.handover,
    );
    const returned = booking.inspections.find(
      (i) => i.type === InspectionType.return,
    );

    // Tên người thao tác (nhân viên lập HĐ, giao/nhận máy, xử lý đổi máy) — 1 truy vấn.
    const staffIds = [
      options.actorId,
      booking.confirmedById,
      handover?.performedById,
      returned?.performedById,
      ...swaps.map((s) => s.resolvedById),
    ].filter((id): id is string => !!id);
    const deviceIds = swaps.flatMap((s) => [
      s.deviceId,
      s.replacementDeviceId!,
    ]);
    const [staff, swapDevices] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, name: true },
      }),
      this.prisma.device.findMany({
        where: { id: { in: deviceIds } },
        select: { id: true, name: true, serialNumber: true },
      }),
    ]);
    const staffName = (id?: string | null) =>
      staff.find((u) => u.id === id)?.name ?? null;
    const deviceInfo = (id: string) => {
      const d = swapDevices.find((x) => x.id === id);
      return { name: d?.name ?? '—', serialNumber: d?.serialNumber ?? null };
    };

    const cccd = options.fullCccd
      ? await this.usersService.revealCccd(
          booking.userId,
          this.configService.get<string>('CCCD_ENCRYPTION_KEY')!,
        )
      : (booking.user.cccdMasked ?? '(chưa có trong hồ sơ)');

    const device = booking.device;
    const isSettled =
      booking.status === BookingStatus.completed && !!booking.returnedAt;
    const payment = booking.payments[0];

    return {
      bookingId: booking.id,
      issuedAt: handover?.createdAt ?? new Date(),
      store: getStoreInfo(),
      staffName:
        staffName(options.actorId) ??
        staffName(booking.confirmedById) ??
        staffName(handover?.performedById),
      customer: {
        name: booking.user.name,
        cccd,
        phone: booking.user.phone,
        email: booking.user.email,
      },
      device: {
        name: device.name,
        category: device.category.name,
        brand: device.brand,
        serialNumber: device.serialNumber,
        originalPrice: Number(device.originalPrice),
        pricePerDay: Number(device.pricePerDay),
        accessories: parseAccessories(device.accessories),
      },
      startTime: booking.startTime,
      endTime: booking.endTime,
      pricing: describeRentalPricing(
        Number(device.pricePerHour),
        Number(device.pricePerDay),
        booking.startTime,
        booking.endTime,
      ),
      // Tiền cọc/tiền thuê LƯU trên đơn (đơn cũ có thể tính theo giá lúc đặt).
      depositAmount: Number(booking.depositAmount),
      deposit: {
        txnRef: payment?.transactionId ?? null,
        paidAt: payment?.paidAt ?? null,
      },
      rental: {
        paid: booking.rentalPaid,
        methodLabel: booking.rentalPaymentMethod
          ? PAYMENT_METHOD_LABEL[booking.rentalPaymentMethod]
          : null,
        paidAt: booking.rentalPaidAt,
      },
      handover: handover
        ? {
            at: handover.createdAt,
            staffName: staffName(handover.performedById),
            notes: handover.notes,
            images: handover.images,
          }
        : null,
      returnInfo: isSettled
        ? {
            returnedAt: booking.returnedAt!,
            staffName: staffName(returned?.performedById),
            conditionLabel: returned
              ? CONDITION_LABEL[returned.condition]
              : endedEarly
                ? 'Kết thúc sớm do thiết bị gặp lỗi (không do Bên B)'
                : '—',
            damageDescription: returned?.damageDescription ?? null,
            notes: returned?.notes ?? null,
            images: returned?.images ?? [],
            lateFee: Number(booking.lateFeeAmount),
            damageFee: Number(booking.damageFeeAmount),
            repairFee: Number(booking.repairFeeAmount),
            depositRefund: Number(booking.depositRefundAmount),
            rentalRefund: Number(booking.rentalRefundAmount),
            amountOwed: Number(booking.amountOwed),
          }
        : null,
      swaps: swaps.map((s) => ({
        at: s.resolvedAt ?? s.createdAt,
        staffName: staffName(s.resolvedById),
        oldDevice: deviceInfo(s.deviceId),
        newDevice: deviceInfo(s.replacementDeviceId!),
        reason: s.description,
        note: s.resolutionNote,
      })),
    };
  }

  /**
   * Tiền thuê in theo số tiền LƯU trên đơn (đã thu), không tính lại theo giá
   * hiện tại — máy có thể đã đổi giá hoặc đã đổi sang máy khác (giá thuê giữ
   * nguyên theo Điều 6). Đơn giá = tổng tiền / số giờ-ngày tính tiền.
   */
  private withStoredTotal(
    data: ContractData,
    totalPrice: number,
  ): ContractData {
    return {
      ...data,
      pricing: {
        ...data.pricing,
        total: totalPrice,
        unitPrice: Math.round(totalPrice / Math.max(data.pricing.quantity, 1)),
      },
    };
  }

  /** Bản in/PDF cho staff/admin — CCCD đầy đủ, font nhúng. */
  async renderForPrint(bookingId: string, actorId: string): Promise<string> {
    const [data, booking] = await Promise.all([
      this.buildData(bookingId, { fullCccd: true, actorId }),
      this.prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { totalPrice: true },
      }),
    ]);
    return renderContractHtml(
      this.withStoredTotal(data, Number(booking.totalPrice)),
      loadContractFontCss(),
    );
  }

  async renderPdf(bookingId: string, actorId: string): Promise<Buffer> {
    return this.pdfService.render(
      await this.renderForPrint(bookingId, actorId),
    );
  }

  /**
   * Lưu bản hợp đồng CCCD CHE vào `Booking.contractContent` (không nhúng font
   * cho nhẹ) — gọi ở các mốc xác nhận, giao máy, trả máy, đổi máy.
   */
  async saveSnapshot(bookingId: string): Promise<void> {
    const [data, booking] = await Promise.all([
      this.buildData(bookingId, { fullCccd: false }),
      this.prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        select: { totalPrice: true },
      }),
    ]);
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        contractContent: renderContractHtml(
          this.withStoredTotal(data, Number(booking.totalPrice)),
          '',
        ),
      },
    });
  }
}
