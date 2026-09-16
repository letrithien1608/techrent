// Tách riêng khỏi bookings.service.ts để tránh import cycle thật ở tầng module
// JS: payments/payments.service.ts cần đúng tên queue này nhưng KHÔNG được phép
// import ngược từ bookings.service.ts (vốn đã import PaymentsService) — nếu 2
// file import lẫn nhau, Node có thể trả về giá trị `undefined` cho hằng số này
// tuỳ thứ tự load, khiến BullMQ đăng ký nhầm queue "default".
export const BOOKING_TTL_QUEUE = 'booking-ttl';
export const BOOKING_TTL_JOB = 'cancel-expired-booking';
