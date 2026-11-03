import { cn } from "cn";
import type { Booking } from "@/lib/bookings-api";
import {
  DEPOSIT_REFUND_STATUS_LABEL,
  isRefundOverdue,
  RENTAL_PAYMENT_METHOD_LABEL,
} from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";

function Line({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 px-4 py-2.5 text-sm", strong && "bg-muted/30")}>
      <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={cn("font-semibold tabular-nums", tone)}>{value}</span>
    </div>
  );
}

/**
 * Bảng tiền của 1 đơn: tiền thuê (thu tại quầy) + quyết toán cọc khi trả máy
 * (cọc − phí trễ hạn − phí hư hỏng = hoàn lại / khách còn nợ) + trạng thái
 * hoàn cọc. Dùng chung cho trang chi tiết đơn của khách và hộp thoại admin.
 */
export function DepositSettlementTable({ booking }: { booking: Booking }) {
  const lateFee = Number(booking.lateFeeAmount ?? 0);
  const damageFee = Number(booking.damageFeeAmount ?? 0);
  const repairFee = Number(booking.repairFeeAmount ?? 0);
  const rentalRefund = Number(booking.rentalRefundAmount ?? 0);
  const owed = Number(booking.amountOwed ?? 0) - Number(booking.debtPaidAmount ?? 0);
  const debtPaid = Number(booking.debtPaidAmount ?? 0);
  const refundStatus = booking.depositRefundStatus ?? "none";
  const settled = refundStatus !== "none";
  const returned = booking.status === "completed" && !!booking.returnedAt && settled;
  const statusMeta = DEPOSIT_REFUND_STATUS_LABEL[refundStatus];
  const overdue = isRefundOverdue(booking);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border/60 divide-y divide-border/50">
        <Line
          label="Tiền thuê (thanh toán tại quầy)"
          value={formatVnd(booking.totalPrice)}
        />
        <div className="px-4 pb-2 -mt-1 text-xs text-muted-foreground">
          {booking.rentalPaid
            ? `Đã thu${booking.rentalPaymentMethod ? ` · ${RENTAL_PAYMENT_METHOD_LABEL[booking.rentalPaymentMethod]}` : ""}${booking.rentalPaidAt ? ` · ${formatDateTimeVi(booking.rentalPaidAt)}` : ""}`
            : "Chưa thu — thanh toán khi nhận máy tại cửa hàng"}
        </div>
        <Line label="Tiền cọc (VNPay)" value={formatVnd(booking.depositAmount)} />
        {returned && (
          <>
            <Line
              label="− Phí trễ hạn"
              value={lateFee > 0 ? `−${formatVnd(lateFee)}` : formatVnd(0)}
              tone={lateFee > 0 ? "text-destructive" : undefined}
            />
            <Line
              label="− Phí hư hỏng / thiếu phụ kiện"
              value={damageFee > 0 ? `−${formatVnd(damageFee)}` : formatVnd(0)}
              tone={damageFee > 0 ? "text-destructive" : undefined}
            />
            {repairFee > 0 && (
              <Line label="− Chi phí sửa (lỗi do người thuê)" value={`−${formatVnd(repairFee)}`} tone="text-destructive" />
            )}
          </>
        )}
        {!returned && repairFee > 0 && (
          <Line
            label="Chi phí sửa sẽ trừ vào cọc khi trả máy"
            value={`−${formatVnd(repairFee)}`}
            tone="text-destructive"
          />
        )}
        {booking.status === "lost" && (
          <Line label="Tiền cọc cửa hàng giữ lại (mất thiết bị)" value={formatVnd(booking.depositAmount)} tone="text-destructive" />
        )}
        {settled && (
          <Line
            label="Tiền cọc hoàn lại"
            value={formatVnd(booking.depositRefundAmount ?? 0)}
            tone="text-emerald-400"
            strong
          />
        )}
        {rentalRefund > 0 && (
          <Line label="Tiền thuê hoàn lại (kết thúc sớm)" value={formatVnd(rentalRefund)} tone="text-emerald-400" strong />
        )}
        {debtPaid > 0 && <Line label="Đã thanh toán nợ" value={formatVnd(debtPaid)} />}
        {owed > 0 && (
          <Line label="Khách còn nợ cửa hàng" value={formatVnd(owed)} tone="text-destructive" strong />
        )}
      </div>

      {settled && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", statusMeta.className)}>
            {statusMeta.label}
          </span>
          {refundStatus === "pending" && booking.depositRefundDueAt && (
            <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
              {overdue ? "Đã quá hạn hoàn" : "Hạn chuyển khoản"}: {formatDateTimeVi(booking.depositRefundDueAt)}
            </span>
          )}
          {refundStatus === "refunded" && (
            <span className="text-xs text-muted-foreground">
              {booking.depositRefundedAt && formatDateTimeVi(booking.depositRefundedAt)}
              {booking.depositRefundTxnRef && ` · Mã giao dịch: ${booking.depositRefundTxnRef}`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
