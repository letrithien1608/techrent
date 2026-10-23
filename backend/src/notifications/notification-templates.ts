// Hàm thuần (không DI) dựng nội dung thông báo: tiêu đề, câu mô tả cụ thể,
// đường dẫn tới đúng trang và metadata cho giao diện. Mọi chỗ tạo thông báo
// đi qua đây để câu chữ/định dạng thống nhất — thêm loại thông báo mới (VD
// thu tiền thuê, trả máy, hoàn cọc) chỉ cần thêm 1 nhánh ở đây + 1 mục ở
// bảng NOTIFICATION_KIND phía frontend.
import type { Prisma } from '../generated/prisma/client';

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
  | { kind: 'expired' };

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
          ? ` Hoàn ${event.refundPercentage}% cọc (${formatVnd(event.refundAmount)}).`
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
