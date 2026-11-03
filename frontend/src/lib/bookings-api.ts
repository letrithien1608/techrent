import { api } from "./api-client";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "ongoing"
  | "completed"
  | "cancelled";

export interface BookingDeviceSummary {
  id: string;
  name: string;
  images: string[];
  categoryId: string;
}

export type RentalPaymentMethod = "cash" | "bank_transfer";
export type DepositRefundStatus = "none" | "pending" | "refunded" | "not_refunded";
export type DeviceCondition = "intact" | "damaged" | "missing_accessories";

/** Biên bản giao máy (`handover`) / nhận lại máy (`return`). */
export interface BookingInspection {
  id: string;
  type: "handover" | "return";
  images: string[];
  notes: string | null;
  condition: DeviceCondition;
  damageDescription: string | null;
  performedById: string;
  createdAt: string;
}

export interface Booking {
  id: string;
  userId: string;
  deviceId: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  totalPrice: string;
  depositAmount: string;
  createdAt: string;
  /** Bản MASKED CCCD, tự sinh khi booking chuyển `confirmed` — `null` trước đó. */
  contractContent?: string | null;
  contractSigned?: boolean;
  contractSignedAt?: string | null;
  /** Phí trễ hạn — TRỪ vào tiền cọc khi trả máy (`totalPrice` chỉ là tiền thuê). */
  lateFeeAmount?: string;
  /** Tiền thuê thu tại quầy khi giao máy. */
  rentalPaid?: boolean;
  rentalPaidAt?: string | null;
  rentalPaymentMethod?: RentalPaymentMethod | null;
  returnedAt?: string | null;
  damageFeeAmount?: string;
  /** Khấu trừ vượt tiền cọc → khách còn nợ. */
  amountOwed?: string;
  depositRefundStatus?: DepositRefundStatus;
  depositRefundAmount?: string;
  depositRefundDueAt?: string | null;
  depositRefundedAt?: string | null;
  depositRefundTxnRef?: string | null;
  /** Chỉ có ở `GET /bookings/:id`. */
  inspections?: BookingInspection[];
  /** Chỉ có ở `GET /bookings` và `GET /bookings/:id` (BookingsService trả kèm include) */
  device?: BookingDeviceSummary;
  /** Khách thuê (tên + SĐT) — nhân viên dùng để liên hệ hoàn cọc. */
  user?: { id: string; name: string; phone: string | null };
}

export interface BookingContract {
  content: string;
  signed: boolean;
  signedAt: string | null;
}

export const BOOKING_TTL_MINUTES = 5;

export interface PaginatedBookings {
  data: Booking[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CancelBookingResult {
  booking: Booking;
  refundPercentage: number;
  refundAmount: string;
}

export async function checkAvailability(
  deviceId: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const { data } = await api.get<{ available: boolean }>(
    "/bookings/availability",
    { params: { deviceId, startTime, endTime } },
  );
  return data.available;
}

export async function createBooking(
  deviceId: string,
  startTime: string,
  endTime: string,
): Promise<Booking> {
  const { data } = await api.post<Booking>("/bookings", {
    deviceId,
    startTime,
    endTime,
  });
  return data;
}

export async function fetchBookingById(id: string): Promise<Booking> {
  const { data } = await api.get<Booking>(`/bookings/${id}`);
  return data;
}

export async function fetchBookings(
  params: {
    page?: number;
    limit?: number;
    status?: BookingStatus;
    /** Chỉ staff/admin dùng được thật — xem ListBookingsQueryDto backend. */
    userId?: string;
    depositRefundStatus?: DepositRefundStatus;
  } = {},
): Promise<PaginatedBookings> {
  const { data } = await api.get<PaginatedBookings>("/bookings", { params });
  return data;
}

/** `storeFault` chỉ có tác dụng khi người gọi là staff/admin (backend tự kiểm tra) — dùng khi cửa hàng từ chối đơn. */
export async function cancelBooking(
  id: string,
  reason?: string,
  options: { storeFault?: boolean } = {},
): Promise<CancelBookingResult> {
  const { data } = await api.patch<CancelBookingResult>(
    `/bookings/${id}/cancel`,
    { reason, ...options },
  );
  return data;
}

// ---- Staff/admin: chuyển trạng thái theo state machine (mục 3.6/Tuần 12) ----

export async function confirmBooking(id: string): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/confirm`);
  return data;
}

export async function startBooking(id: string): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/start`);
  return data;
}

// ---- Giao máy tại quầy: biên bản + thu tiền thuê + ký hợp đồng → start ----

export async function recordHandover(
  id: string,
  files: File[],
  notes?: string,
): Promise<Booking> {
  // KHÔNG tự set Content-Type — để trình duyệt thêm boundary (xem CLAUDE.md).
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  if (notes) form.append("notes", notes);
  const { data } = await api.post<Booking>(`/bookings/${id}/handover`, form);
  return data;
}

export async function recordRentalPayment(
  id: string,
  method: RentalPaymentMethod,
): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/rental-payment`, { method });
  return data;
}

// ---- Trả máy + quyết toán cọc ----

export interface ReturnPreview {
  depositAmount: number;
  lateFee: number;
  damageFee: number;
  totalDeductions: number;
  refundAmount: number;
  amountOwed: number;
}

export async function previewReturn(id: string, damageFee: number): Promise<ReturnPreview> {
  const { data } = await api.get<ReturnPreview>(`/bookings/${id}/return-preview`, {
    params: { damageFee },
  });
  return data;
}

export async function confirmReturn(
  id: string,
  input: {
    condition: DeviceCondition;
    damageDescription?: string;
    damageFee?: number;
    notes?: string;
    files: File[];
  },
): Promise<Booking> {
  const form = new FormData();
  form.append("condition", input.condition);
  if (input.damageDescription) form.append("damageDescription", input.damageDescription);
  if (input.damageFee !== undefined) form.append("damageFee", String(input.damageFee));
  if (input.notes) form.append("notes", input.notes);
  input.files.forEach((file) => form.append("images", file));
  const { data } = await api.post<Booking>(`/bookings/${id}/return`, form);
  return data;
}

export async function markDepositRefunded(id: string, transactionRef: string): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/deposit-refund`, {
    transactionRef,
  });
  return data;
}

export interface FinancialStats {
  rentalRevenue: number;
  lateFees: number;
  damageFees: number;
  depositHeld: number;
  amountOwed: number;
  pendingRefundCount: number;
  overdueRefundCount: number;
}

export async function fetchFinancialStats(): Promise<FinancialStats> {
  const { data } = await api.get<FinancialStats>("/bookings/stats");
  return data;
}

// ---- Staff/admin: hợp đồng thuê — xem/in (CCCD đầy đủ) + đánh dấu đã ký tay ----

export async function fetchContractForPrint(
  id: string,
): Promise<BookingContract> {
  const { data } = await api.get<BookingContract>(`/bookings/${id}/contract`);
  return data;
}

export async function setContractSigned(
  id: string,
  signed: boolean,
): Promise<Booking> {
  const { data } = await api.patch<Booking>(
    `/bookings/${id}/contract/signed`,
    { signed },
  );
  return data;
}
