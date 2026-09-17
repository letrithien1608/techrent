"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  extractBookingIdFromTxnRef,
  verifyVnpayReturn,
} from "@/lib/payments-api";

type ResultState = "loading" | "success" | "failed" | "error";

function VnpayReturnContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<ResultState>("loading");
  const [bookingId, setBookingId] = useState<string | null>(null);

  useEffect(() => {
    const query: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      query[key] = value;
    });

    verifyVnpayReturn(query)
      .then((result) => {
        const txnRef = result.txnRef ?? query.vnp_TxnRef;
        if (txnRef) {
          setBookingId(extractBookingIdFromTxnRef(txnRef));
        }
        setState(result.valid && result.responseCode === "00" ? "success" : "failed");
      })
      .catch(() => setState("error"));
  }, [searchParams]);

  const bookingHref = bookingId ? `/bookings/${bookingId}` : "/bookings";

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          {state === "loading" && (
            <>
              <Loader2 className="size-12 animate-spin text-primary" />
              <p className="text-muted-foreground">Đang xác nhận kết quả thanh toán...</p>
            </>
          )}

          {state === "success" && (
            <>
              <CheckCircle2 className="size-14 text-emerald-400" />
              <h1 className="font-heading text-2xl font-bold">Thanh toán thành công</h1>
              <p className="text-muted-foreground">
                Đơn thuê của bạn đã được xác nhận. Cảm ơn bạn đã sử dụng TechRent!
              </p>
              <Button size="lg" className="mt-2 w-full" nativeButton={false} render={<Link href={bookingHref} />}>
                Xem đơn của tôi
              </Button>
            </>
          )}

          {(state === "failed" || state === "error") && (
            <>
              <XCircle className="size-14 text-destructive" />
              <h1 className="font-heading text-2xl font-bold">Thanh toán không thành công</h1>
              <p className="text-muted-foreground">
                {state === "error"
                  ? "Không thể xác minh kết quả thanh toán — vui lòng kiểm tra lại đơn của bạn."
                  : "Giao dịch đã bị huỷ hoặc thất bại. Bạn có thể thử thanh toán lại."}
              </p>
              <Button size="lg" className="mt-2 w-full" nativeButton={false} render={<Link href={bookingHref} />}>
                Thử lại
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VnpayReturnPage() {
  return (
    <Suspense fallback={null}>
      <VnpayReturnContent />
    </Suspense>
  );
}
