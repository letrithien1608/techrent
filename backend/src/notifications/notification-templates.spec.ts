import {
  bookingCode,
  buildBookingNotification,
  buildMaintenanceNotification,
  type BookingNotificationSource,
} from './notification-templates';

const booking: BookingNotificationSource = {
  id: 'ab12cd34-0000-4000-8000-000000000000',
  // 09:00 25/10 và 18:00 27/10 giờ Việt Nam
  startTime: new Date('2026-10-25T02:00:00Z'),
  endTime: new Date('2026-10-27T11:00:00Z'),
  totalPrice: 1_140_000,
  depositAmount: 22_500_000,
  device: {
    id: 'dev-1',
    name: 'MacBook Pro M3',
    images: ['https://img/1.jpg'],
  },
  user: { name: 'Nguyễn Văn A' },
};

describe('notification-templates', () => {
  it('đơn mới cho nhân viên: câu cụ thể đúng mẫu, link vào trang quản trị mở đúng đơn', () => {
    const n = buildBookingNotification(booking, { kind: 'pending' }, 'staff');
    expect(n.type).toBe('booking_pending');
    expect(n.message).toBe(
      'Đơn mới #AB12CD34 – Nguyễn Văn A thuê MacBook Pro M3 (25/10 → 27/10) · Cọc 22.500.000đ',
    );
    expect(n.link).toBe(`/admin/bookings?bookingId=${booking.id}`);
    expect(n.metadata).toMatchObject({
      bookingId: booking.id,
      bookingCode: '#AB12CD34',
      deviceName: 'MacBook Pro M3',
      deviceImage: 'https://img/1.jpg',
      customerName: 'Nguyễn Văn A',
      depositAmount: 22_500_000,
      startTime: booking.startTime.toISOString(),
    });
  });

  it('thông báo cho khách: link tới chi tiết đơn của mình, không kèm tên khách trong metadata', () => {
    const n = buildBookingNotification(
      booking,
      { kind: 'confirmed' },
      'customer',
    );
    expect(n.link).toBe(`/bookings/${booking.id}`);
    expect(n.metadata).not.toHaveProperty('customerName');
    expect(n.message).toContain('09:00 25/10');
  });

  it('huỷ bởi cửa hàng: ghi rõ lý do và số tiền hoàn', () => {
    const n = buildBookingNotification(
      booking,
      {
        kind: 'cancelled',
        byStore: true,
        reason: 'Máy đang sửa',
        refundPercentage: 100,
        refundAmount: 22_500_000,
      },
      'customer',
    );
    expect(n.title).toBe('Đơn thuê bị từ chối/huỷ');
    expect(n.message).toContain('bởi cửa hàng');
    expect(n.message).toContain('Lý do: Máy đang sửa.');
    expect(n.message).toContain('Hoàn 100% cọc (22.500.000đ)');
    expect(n.metadata).toMatchObject({
      reason: 'Máy đang sửa',
      refundPercentage: 100,
    });
  });

  it('huỷ không hoàn tiền thì không nhắc hoàn', () => {
    const n = buildBookingNotification(
      booking,
      {
        kind: 'cancelled',
        byStore: false,
        refundPercentage: 0,
        refundAmount: 0,
      },
      'customer',
    );
    expect(n.message).not.toContain('Hoàn');
  });

  it('thanh toán, nhận máy, tự huỷ có loại và tiêu đề riêng', () => {
    expect(
      buildBookingNotification(booking, { kind: 'paid' }, 'customer').type,
    ).toBe('booking_paid');
    expect(
      buildBookingNotification(booking, { kind: 'ongoing' }, 'customer')
        .message,
    ).toContain('Hạn trả: 18:00 27/10');
    expect(
      buildBookingNotification(booking, { kind: 'expired' }, 'customer').title,
    ).toBe('Đơn tự huỷ do quá hạn thanh toán');
  });

  it('báo hỏng: link trang bảo trì, kèm thiết bị và người báo', () => {
    const n = buildMaintenanceNotification({
      maintenanceId: 'm-1',
      device: booking.device,
      issue: 'Không lên nguồn',
      reporterName: 'Trần B',
    });
    expect(n.link).toBe('/admin/maintenance');
    expect(n.message).toBe(
      'MacBook Pro M3 vừa được báo hỏng bởi Trần B: Không lên nguồn',
    );
  });

  it('mã đơn ngắn viết hoa', () => {
    expect(bookingCode('ab12cd34-xxxx')).toBe('#AB12CD34');
  });
});
