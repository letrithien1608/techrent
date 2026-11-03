// Hàm thuần (không DI) dựng nội dung thông báo: tiêu đề, câu mô tả cụ thể,
// đường dẫn tới đúng trang và metadata cho giao diện. Mọi chỗ tạo thông báo
// đi qua đây để câu chữ/định dạng thống nhất — thêm loại thông báo mới (VD
// thu tiền thuê, trả máy, hoàn cọc) chỉ cần thêm 1 nhánh ở đây + 1 mục ở
// bảng NOTIFICATION_KIND phía frontend.
import type { Prisma } from '../generated/prisma/client';
import { DEPOSIT_REFUND_BUSINESS_DAYS } from '../common/business-policy';

export type NotificationAudience = 'customer' | 'staff';

export interface NotificationContent {
  type: string;
  title: string;
  message: string;
  link: string | null;
  metadata: Prisma.InputJsonObject;
}

/** Dữ liệu tối thiểu của 1 booking cần cho thông báo (kèm thiết bị + khách). */
export interface BookingNotificationSource {
  id: string;
  startTime: Date;
  endTime: Date;
  totalPrice: Prisma.Decimal | number | string;
  depositAmount: Prisma.Decimal | number | string;
  device: { id: string; name: string; images: string[] };
  user: { name: string };
}

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function bookingCode(bookingId: string): string {
  return `#${bookingId.slice(0, 8).toUpperCase()}`;
}

export function formatVnd(value: Prisma.Decimal | number | string): string {
  return `${Math.round(Number(value)).toLocaleString('vi-VN')}đ`;
}

/** "25/10" — tự ghép từ formatToParts vì ICU định dạng ngày-tháng vi-VN bằng dấu "-". */
function formatDay(date: Date): string {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('day')}/${part('month')}`;
}

function formatTimeDay(date: Date): string {
  const time = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${time} ${formatDay(date)}`;
}

export function bookingLink(
  bookingId: string,
  audience: NotificationAudience,
): string {
  return audience === 'staff'
    ? `/admin/bookings?bookingId=${bookingId}`
    : `/bookings/${bookingId}`;
}

function bookingMetadata(
  booking: BookingNotificationSource,
  audience: NotificationAudience,
): Prisma.InputJsonObject {
  return {
    bookingId: booking.id,
    bookingCode: bookingCode(booking.id),
    deviceId: booking.device.id,
    deviceName: booking.device.name,
    deviceImage: booking.device.images?.[0] ?? null,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
    totalPrice: Number(booking.totalPrice),
    depositAmount: Number(booking.depositAmount),
    // Tên khách chỉ cần cho nhân viên (khách tự biết tên mình).
    ...(audience === 'staff' ? { customerName: booking.user.name } : {}),
  };
}

/** "MacBook Pro 14" M3 Pro (25/10 → 27/10)" */
function deviceAndPeriod(booking: BookingNotificationSource): string {
  return `${booking.device.name} (${formatDay(booking.startTime)} → ${formatDay(booking.endTime)})`;
}

export type BookingNotificationKind =
  | { kind: 'pending' }
  | { kind: 'confirmed' }
  | { kind: 'paid' }
  | { kind: 'ongoing' }
  | {
      kind: 'cancelled';
      byStore: boolean;
      reason?: string | null;
      refundPercentage: number;
      refundAmount: number;
    }
  | { kind: 'expired' }
  | { kind: 'rental_paid'; method: 'cash' | 'bank_transfer' }
  | {
      kind: 'returned';
      lateFee: number;
      damageFee: number;
      refundAmount: number;
      amountOwed: number;
    }
  | { kind: 'deposit_refunded'; amount: number; transactionRef: string }
  | { kind: 'issue_reported'; reportId: string; description: string }
  | {
      kind: 'issue_resolved';
      resolution: 'swapped' | 'ended_early' | 'customer_fault';
      replacementDeviceName?: string;
      rentalRefund?: number;
      depositRefund?: number;
      repairCost?: number;
      note?: string | null;
    }
  | { kind: 'suspected_lost'; overdueDays: number }
  | { kind: 'lost'; amountOwed: number; lateFee: number }
  | { kind: 'debt_paid'; amount: number; remaining: number };

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const RENTAL_PAYMENT_METHOD_LABEL = {
  cash: 'tiền mặt',
  bank_transfer: 'chuyển khoản',
} as const;

const REFUND_DEADLINE = `trong tối đa ${DEPOSIT_REFUND_BUSINESS_DAYS} ngày làm việc`;

export function buildBookingNotification(
  booking: BookingNotificationSource,
  event: BookingNotificationKind,
  audience: NotificationAudience,
): NotificationContent {
  const code = bookingCode(booking.id);
  const base = {
    link: bookingLink(booking.id, audience),
    metadata: bookingMetadata(booking, audience),
  };

  switch (event.kind) {
    case 'pending':
      return {
        ...base,
        type: 'booking_pending',
        title: 'Đơn thuê mới chờ xác nhận',
        message: `Đơn mới ${code} – ${booking.user.name} thuê ${deviceAndPeriod(booking)} · Cọc ${formatVnd(booking.depositAmount)}`,
      };
    case 'confirmed':
      return {
        ...base,
        type: 'booking_confirmed',
        title: 'Đơn thuê đã được xác nhận',
        message: `Đơn ${code} – ${deviceAndPeriod(booking)} đã được xác nhận. Hẹn bạn nhận máy lúc ${formatTimeDay(booking.startTime)}.`,
      };
    case 'paid':
      return {
        ...base,
        type: 'booking_paid',
        title: 'Thanh toán cọc thành công',
        message: `Đã nhận cọc ${formatVnd(booking.depositAmount)} cho đơn ${code} – ${deviceAndPeriod(booking)}. Đơn đã được xác nhận.`,
      };
    case 'ongoing':
      return {
        ...base,
        type: 'booking_ongoing',
        title: 'Đã nhận thiết bị',
        message: `Bạn đang thuê ${booking.device.name} (đơn ${code}). Hạn trả: ${formatTimeDay(booking.endTime)}.`,
      };
    case 'cancelled': {
      const reason = event.reason?.trim();
      const refund =
        event.refundPercentage > 0
          ? ` Hoàn ${event.refundPercentage}% cọc (${formatVnd(event.refundAmount)}) bằng chuyển khoản ${REFUND_DEADLINE}.`
          : '';
      return {
        type: 'booking_cancelled',
        title: event.byStore ? 'Đơn thuê bị từ chối/huỷ' : 'Đơn thuê đã bị huỷ',
        message: `Đơn ${code} – ${deviceAndPeriod(booking)} đã bị huỷ${event.byStore ? ' bởi cửa hàng' : ''}.${reason ? ` Lý do: ${reason}.` : ''}${refund}`,
        link: base.link,
        metadata: {
          ...base.metadata,
          refundPercentage: event.refundPercentage,
          refundAmount: event.refundAmount,
          ...(reason ? { reason } : {}),
        },
      };
    }
    case 'expired':
      return {
        ...base,
        type: 'booking_cancelled',
        title: 'Đơn tự huỷ do quá hạn thanh toán',
        message: `Đơn ${code} – ${deviceAndPeriod(booking)} đã tự huỷ vì chưa thanh toán cọc đúng hạn. Bạn có thể đặt lại nếu thiết bị còn trống.`,
      };
    case 'rental_paid':
      return {
        ...base,
        type: 'booking_rental_paid',
        title: 'Đã thu tiền thuê',
        message: `Cửa hàng đã nhận ${formatVnd(booking.totalPrice)} tiền thuê (${RENTAL_PAYMENT_METHOD_LABEL[event.method]}) cho đơn ${code} – ${booking.device.name}.`,
        metadata: { ...base.metadata, rentalPaymentMethod: event.method },
      };
    case 'returned': {
      const deductions = [
        event.lateFee > 0 ? `phí trễ hạn ${formatVnd(event.lateFee)}` : null,
        event.damageFee > 0
          ? `phí hư hỏng ${formatVnd(event.damageFee)}`
          : null,
      ].filter(Boolean);
      const deductionText = deductions.length
        ? ` Đã trừ ${deductions.join(', ')}.`
        : '';
      const outcome =
        event.refundAmount > 0
          ? ` Tiền cọc hoàn lại: ${formatVnd(event.refundAmount)}, chuyển khoản ${REFUND_DEADLINE}.`
          : ' Không còn tiền cọc để hoàn.';
      const owed =
        event.amountOwed > 0
          ? ` Bạn còn thiếu ${formatVnd(event.amountOwed)}, vui lòng liên hệ cửa hàng để thanh toán.`
          : '';
      return {
        ...base,
        type: 'booking_returned',
        title: 'Cửa hàng đã nhận lại máy',
        message: `Đã nhận lại ${booking.device.name} (đơn ${code}).${deductionText}${outcome}${owed}`,
        metadata: {
          ...base.metadata,
          lateFee: event.lateFee,
          damageFee: event.damageFee,
          refundAmount: event.refundAmount,
          amountOwed: event.amountOwed,
        },
      };
    }
    case 'deposit_refunded':
      return {
        ...base,
        type: 'booking_deposit_refunded',
        title: 'Đã hoàn tiền cọc',
        message: `Cửa hàng đã chuyển khoản hoàn ${formatVnd(event.amount)} tiền cọc cho đơn ${code} – ${booking.device.name}. Mã giao dịch: ${event.transactionRef}.`,
        metadata: {
          ...base.metadata,
          refundAmount: event.amount,
          transactionRef: event.transactionRef,
        },
      };
    case 'issue_reported':
      return {
        ...base,
        type: 'issue_reported',
        title: 'Khách báo lỗi thiết bị',
        message: `${booking.user.name} báo lỗi ${booking.device.name} (đơn ${code}): ${truncate(event.description, 120)}`,
        link: `/admin/issues?reportId=${event.reportId}`,
        metadata: { ...base.metadata, reportId: event.reportId },
      };
    case 'issue_resolved': {
      const outcome =
        event.resolution === 'swapped'
          ? `Cửa hàng đổi cho bạn máy ${event.replacementDeviceName ?? 'tương đương'}, vui lòng đến cửa hàng để nhận máy thay thế. Thời hạn thuê giữ nguyên.`
          : event.resolution === 'ended_early'
            ? `Đơn kết thúc sớm: hoàn ${formatVnd(event.rentalRefund ?? 0)} tiền thuê phần chưa dùng và ${formatVnd(event.depositRefund ?? 0)} tiền cọc, chuyển khoản ${REFUND_DEADLINE}.`
            : `Lỗi được xác định do quá trình sử dụng. Chi phí sửa ${formatVnd(event.repairCost ?? 0)} sẽ được trừ vào tiền cọc khi bạn trả máy.`;
      return {
        ...base,
        type: 'issue_resolved',
        title: 'Đã xử lý báo lỗi thiết bị',
        message: `Báo lỗi ${booking.device.name} (đơn ${code}) đã được xử lý. ${outcome}${event.note ? ` Ghi chú: ${event.note}.` : ''}`,
        metadata: {
          ...base.metadata,
          resolution: event.resolution,
          ...(event.rentalRefund !== undefined
            ? { rentalRefund: event.rentalRefund }
            : {}),
          ...(event.repairCost !== undefined
            ? { repairCost: event.repairCost }
            : {}),
        },
      };
    }
    case 'suspected_lost':
      return audience === 'staff'
        ? {
            ...base,
            type: 'booking_suspected_lost',
            title: 'Nghi mất thiết bị',
            message: `Đơn ${code} – ${booking.user.name} quá hạn trả ${booking.device.name} ${event.overdueDays} ngày. Cần liên hệ khách hoặc xác nhận mất thiết bị.`,
          }
        : {
            ...base,
            type: 'booking_overdue',
            title: 'Đơn thuê đã quá hạn trả',
            message: `Bạn đã quá hạn trả ${booking.device.name} (đơn ${code}) ${event.overdueDays} ngày. Vui lòng mang máy đến cửa hàng ngay; nếu không, cửa hàng sẽ xác nhận mất thiết bị, giữ toàn bộ tiền cọc và ghi nợ phần còn lại.`,
          };
    case 'lost':
      return {
        ...base,
        type: 'booking_lost',
        title: 'Đã xác nhận mất thiết bị',
        message: `Đơn ${code} – ${booking.device.name} đã được xác nhận mất thiết bị. Cửa hàng giữ toàn bộ tiền cọc ${formatVnd(booking.depositAmount)}; bạn còn nợ ${formatVnd(event.amountOwed)} (gồm phí trễ hạn ${formatVnd(event.lateFee)}). Tài khoản của bạn bị tạm khoá đặt thuê.`,
        metadata: {
          ...base.metadata,
          amountOwed: event.amountOwed,
          lateFee: event.lateFee,
        },
      };
    case 'debt_paid':
      return {
        ...base,
        type: 'debt_paid',
        title: 'Đã nhận thanh toán khoản nợ',
        message:
          event.remaining > 0
            ? `Cửa hàng đã nhận ${formatVnd(event.amount)} cho khoản nợ của đơn ${code}. Bạn còn nợ ${formatVnd(event.remaining)}.`
            : `Cửa hàng đã nhận ${formatVnd(event.amount)} — khoản nợ của đơn ${code} đã được thanh toán hết.`,
        metadata: {
          ...base.metadata,
          amount: event.amount,
          remaining: event.remaining,
        },
      };
  }
}

export function buildMaintenanceNotification(input: {
  maintenanceId: string;
  device: { id: string; name: string; images: string[] };
  issue: string;
  reporterName: string | null;
}): NotificationContent {
  return {
    type: 'maintenance_reported',
    title: 'Thiết bị được báo hỏng',
    message: `${input.device.name} vừa được báo hỏng${input.reporterName ? ` bởi ${input.reporterName}` : ''}: ${input.issue}`,
    link: '/admin/maintenance',
    metadata: {
      maintenanceId: input.maintenanceId,
      deviceId: input.device.id,
      deviceName: input.device.name,
      deviceImage: input.device.images?.[0] ?? null,
      issue: input.issue,
      ...(input.reporterName ? { reporterName: input.reporterName } : {}),
    },
  };
}
