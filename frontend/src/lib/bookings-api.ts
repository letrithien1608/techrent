import { api } from "./api-client";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "ongoing"
  | "completed"
  | "cancelled"
  | "lost";

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

export type IssueResolution = "swapped" | "ended_early" | "customer_fault";

/** Báo lỗi thiết bị giữa kỳ thuê + kết quả xử lý. */
export interface DeviceIssueReport {
  id: string;
  bookingId: string;
  deviceId: string;
  description: string;
  /** URL ảnh/video Cloudinary — video có "/video/upload/". */
  media: string[];
  status: "open" | "resolved";
  resolution: IssueResolution | null;
  resolutionNote: string | null;
  repairCost: string;
  replacementDeviceId: string | null;
  rentalRefundAmount: string;
  resolvedAt: string | null;
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
  issueReports?: DeviceIssueReport[];
  /** Chi phí sửa do lỗi của khách (ghi khi xử lý báo lỗi) — trừ vào cọc khi trả máy. */
  repairFeeAmount?: string;
  /** Tiền thuê hoàn lại khi kết thúc sớm do lỗi thiết bị. */
  rentalRefundAmount?: string;
  suspectedLostAt?: string | null;
  lostConfirmedAt?: string | null;
  debtPaidAmount?: string;
  isDemo?: boolean;
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
    /** Bỏ đơn dữ liệu mẫu (chỉ có tác dụng với staff/admin). */
    excludeDemo?: boolean;
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
  repairFee: number;
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
  outstandingDebt: number;
  debtCollected: number;
  pendingRefundCount: number;
  overdueRefundCount: number;
  suspectedLostCount: number;
  lostDeviceCount: number;
  openIssueCount: number;
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

// ---- Báo lỗi thiết bị giữa kỳ thuê ----

export async function reportIssue(bookingId: string, description: string, files: File[]): Promise<DeviceIssueReport> {
  const form = new FormData();
  form.append("description", description);
  files.forEach((file) => form.append("media", file));
  const { data } = await api.post<DeviceIssueReport>(`/bookings/${bookingId}/issues`, form);
  return data;
}

export interface IssueReportWithBooking extends DeviceIssueReport {
  booking: Booking;
}

export async function fetchIssueReports(params: {
  status?: "open" | "resolved";
  page?: number;
  limit?: number;
}): Promise<{ data: IssueReportWithBooking[]; meta: PaginatedBookings["meta"] }> {
  const { data } = await api.get("/issue-reports", { params });
  return data;
}

export interface ReplacementCandidate {
  id: string;
  name: string;
  images: string[];
  originalPrice: number;
  pricePerDay: number;
}

export async function fetchReplacementCandidates(bookingId: string): Promise<ReplacementCandidate[]> {
  const { data } = await api.get<ReplacementCandidate[]>(`/bookings/${bookingId}/replacement-candidates`);
  return data;
}

export async function resolveIssue(
  reportId: string,
  input: {
    resolution: IssueResolution;
    replacementDeviceId?: string;
    repairCost?: number;
    note?: string;
    files?: File[];
  },
): Promise<IssueReportWithBooking> {
  const form = new FormData();
  form.append("resolution", input.resolution);
  if (input.replacementDeviceId) form.append("replacementDeviceId", input.replacementDeviceId);
  if (input.repairCost !== undefined) form.append("repairCost", String(input.repairCost));
  if (input.note) form.append("note", input.note);
  (input.files ?? []).forEach((file) => form.append("images", file));
  const { data } = await api.post<IssueReportWithBooking>(`/issue-reports/${reportId}/resolve`, form);
  return data;
}

// ---- Không trả máy (chỉ admin) ----

export interface LossPreview {
  depositAmount: number;
  originalPrice: number;
  deviceName: string;
  lateFee: number;
  amountOwed: number;
}

export async function fetchLossPreview(id: string): Promise<LossPreview> {
  const { data } = await api.get<LossPreview>(`/bookings/${id}/loss-preview`);
  return data;
}

export async function confirmLost(id: string, note?: string): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/confirm-lost`, { note });
  return data;
}

export async function runOverdueCheck(): Promise<{ flagged: number }> {
  const { data } = await api.post<{ flagged: number }>("/bookings/overdue-check");
  return data;
}

// ---- Công nợ ----

export interface DebtPaymentRecord {
  id: string;
  amount: string;
  method: RentalPaymentMethod;
  note: string | null;
  createdAt: string;
}

export interface DebtLine {
  bookingId: string;
  status: BookingStatus;
  device: { id: string; name: string; images: string[] };
  amountOwed: number;
  debtPaidAmount: number;
  outstanding: number;
  payments: DebtPaymentRecord[];
}

export async function fetchMyDebt(): Promise<{ total: number; bookings: DebtLine[] }> {
  const { data } = await api.get("/debts/me");
  return data;
}

export interface Debtor {
  user: { id: string; name: string; email: string; phone: string | null; isBlacklisted: boolean };
  total: number;
  bookings: DebtLine[];
}

export async function fetchDebtors(): Promise<Debtor[]> {
  const { data } = await api.get<Debtor[]>("/debts");
  return data;
}

export async function collectDebt(
  bookingId: string,
  input: { amount: number; method: RentalPaymentMethod; note?: string },
): Promise<DebtPaymentRecord> {
  const { data } = await api.post<DebtPaymentRecord>(`/debts/bookings/${bookingId}/payments`, input);
  return data;
}
