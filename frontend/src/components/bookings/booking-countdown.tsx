"use client";

import { cn } from "cn";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

function FlipDigits({ value, urgent }: { value: string; urgent: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-block h-12 w-9 overflow-hidden rounded-lg sm:h-14 sm:w-11",
        urgent ? "bg-destructive/10" : "bg-primary/10",
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={cn(
            "absolute inset-0 flex items-center justify-center font-heading text-2xl font-bold tabular-nums sm:text-3xl",
            urgent ? "text-destructive" : "text-primary",
          )}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function BookingCountdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: Date;
  onExpire?: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, expiresAt.getTime() - Date.now()),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const next = Math.max(0, expiresAt.getTime() - Date.now());
      setRemainingMs(next);
      if (next === 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = totalSeconds <= 60;

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm text-muted-foreground">
        Vui lòng thanh toán trong
      </p>
      <div className="flex items-center gap-1.5">
        <FlipDigits value={String(minutes).padStart(2, "0")} urgent={urgent} />
        <span
          className={cn(
            "font-heading text-2xl font-bold sm:text-3xl",
            urgent ? "text-destructive" : "text-primary",
          )}
        >
          :
        </span>
        <FlipDigits value={String(seconds).padStart(2, "0")} urgent={urgent} />
      </div>
      {urgent && remainingMs > 0 && (
        <p className="text-xs text-destructive">
          Sắp hết thời gian giữ đơn!
        </p>
      )}
    </div>
  );
}
