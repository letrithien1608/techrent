import { api } from "./api-client";

export interface CreateVnpayUrlResult {
  paymentUrl: string;
  paymentId: string;
}

export async function createVnpayPaymentUrl(
  bookingId: string,
): Promise<CreateVnpayUrlResult> {
  const { data } = await api.post<CreateVnpayUrlResult>("/payments/vnpay/create", {
    bookingId,
  });
  return data;
}

export interface VnpayReturnResult {
  valid: boolean;
  responseCode?: string;
  txnRef?: string;
}

export async function verifyVnpayReturn(
  query: Record<string, string>,
): Promise<VnpayReturnResult> {
  const { data } = await api.get<VnpayReturnResult>("/payments/vnpay/return", {
    params: query,
  });
  return data;
}

/**
 * `PaymentsService.createPaymentUrl()` (backend) sinh `vnp_TxnRef` theo format
 * `${bookingId}-${Date.now()}` — bookingId là UUID (5 nhóm ký tự nối bằng `-`),
 * nên lấy 5 nhóm đầu tiên là khôi phục lại đúng bookingId ban đầu, không cần
 * lưu thêm state nào ở trình duyệt trước khi redirect sang VNPay.
 */
export function extractBookingIdFromTxnRef(txnRef: string): string | null {
  const parts = txnRef.split("-");
  if (parts.length < 6) return null;
  return parts.slice(0, 5).join("-");
}
