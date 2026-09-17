"use client";

import { cn } from "cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/devices/star-rating";
import {
  BookingSchedulePicker,
  type BookingSchedule,
} from "@/components/devices/booking-schedule-picker";
import { checkAvailability, createBooking } from "@/lib/bookings-api";
import { DEVICE_STATUS_LABEL, formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuthStore } from "@/stores/auth-store";
import type { Device } from "@/lib/devices-api";

interface Props {
  device: Device;
  avgRating: number;
  reviewCount: number;
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
  },
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export function DeviceBookingPanel({ device, avgRating, reviewCount }: Props) {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  const [priceMode, setPriceMode] = useState<"day" | "hour">("day");
  const [schedule, setSchedule] = useState<BookingSchedule | null>(null);
  const isAvailable = device.status === "available";
  const status = DEVICE_STATUS_LABEL[device.status];
  const activePrice = priceMode === "day" ? device.pricePerDay : device.pricePerHour;
  const activeUnit = priceMode === "day" ? "/ngày" : "/giờ";

  const bookMutation = useMutation({
    mutationFn: async (value: BookingSchedule) => {
      const startTime = value.startTime.toISOString();
      const endTime = value.endTime.toISOString();
      const available = await checkAvailability(device.id, startTime, endTime);
      if (!available) {
        throw new Error("SLOT_TAKEN");
      }
      return createBooking(device.id, startTime, endTime);
    },
    onSuccess: (booking) => {
      toast.success("Đặt thuê thành công! Vui lòng thanh toán trong 5 phút.");
      router.push(`/bookings/${booking.id}`);
    },
    onError: (error: unknown) => {
      const isSlotTaken =
        (error instanceof Error && error.message === "SLOT_TAKEN") ||
        (axios.isAxiosError(error) && error.response?.status === 409);
      if (isSlotTaken) {
        toast.error(
          "Thiết bị đã được đặt trong khung giờ này, vui lòng chọn thời gian khác",
        );
        return;
      }
      toast.error(getErrorMessage(error, "Không thể tạo đơn đặt thuê, vui lòng thử lại"));
    },
  });

  function handleBookNow() {
    if (!hasHydrated) return;
    if (!user) {
      router.push(`/login?redirect=${encodeURIComponent(`/devices/${device.id}`)}`);
      return;
    }
    if (!schedule) {
      toast.error("Vui lòng chọn thời gian thuê trước");
      return;
    }
    bookMutation.mutate(schedule);
  }

  const ctaLabel = !isAvailable
    ? "Hết hàng"
    : bookMutation.isPending
      ? "Đang xử lý..."
      : "Đặt thuê ngay";

  return (
    <div className="lg:sticky lg:top-20 lg:self-start">
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.nav
          variants={fadeUp}
          className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link href="/" className="transition-colors hover:text-foreground">
            Trang chủ
          </Link>
          <ChevronRight className="size-3.5 shrink-0" />
          <Link href="/devices" className="transition-colors hover:text-foreground">
            {device.category.name}
          </Link>
          <ChevronRight className="size-3.5 shrink-0" />
          <span className="truncate text-foreground">{device.name}</span>
        </motion.nav>

        <motion.h1
          variants={fadeUp}
          className="mt-3 text-balance font-heading text-3xl font-bold tracking-tight sm:text-4xl"
        >
          {device.name}
        </motion.h1>

        <motion.div variants={fadeUp} className="mt-2 flex items-center gap-2">
          {reviewCount > 0 ? (
            <>
              <StarRating rating={avgRating} />
              <span className="text-sm text-muted-foreground">
                {avgRating.toFixed(1)} ({reviewCount} đánh giá)
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Chưa có đánh giá nào
            </span>
          )}
        </motion.div>

        <motion.div
          variants={fadeUp}
          className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm shadow-black/5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="relative inline-flex rounded-full border border-border/60 p-0.5 text-sm">
              {(["day", "hour"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPriceMode(mode)}
                  className="relative rounded-full px-3 py-1 font-medium transition-colors"
                >
                  {priceMode === mode && (
                    <motion.span
                      layoutId="price-mode-pill"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative z-10",
                      priceMode === mode
                        ? "text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode === "day" ? "Theo ngày" : "Theo giờ"}
                  </span>
                </button>
              ))}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                status.className,
              )}
            >
              {status.label}
            </span>
          </div>

          <div className="mt-4 flex items-baseline gap-2 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={priceMode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="bg-gradient-to-r from-primary to-cyan-300 bg-clip-text font-heading text-3xl font-extrabold tracking-tight text-transparent"
              >
                {formatVnd(activePrice)}
              </motion.span>
            </AnimatePresence>
            <span className="text-base font-normal text-muted-foreground">
              {activeUnit}
            </span>
          </div>

          {isAvailable && (
            <div className="mt-5">
              <BookingSchedulePicker value={schedule} onChange={setSchedule} />
            </div>
          )}

          <Button
            size="lg"
            disabled={!isAvailable || bookMutation.isPending}
            onClick={handleBookNow}
            className="mt-5 w-full shadow-lg shadow-primary/40 hover:shadow-primary/60"
          >
            {bookMutation.isPending && <Loader2 className="animate-spin" />}
            {ctaLabel}
          </Button>
          {!isAvailable && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Hiện đang hết hàng, vui lòng quay lại sau
            </p>
          )}
        </motion.div>
      </motion.div>

      {/* Mobile: thanh cố định dưới cùng màn hình thay cho sidebar sticky */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 shadow-[0_-12px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <p className="font-heading text-lg font-bold">
            {formatVnd(device.pricePerDay)}
            <span className="text-sm font-normal text-muted-foreground">
              /ngày
            </span>
          </p>
          <Button
            size="lg"
            disabled={!isAvailable || bookMutation.isPending}
            onClick={handleBookNow}
            className="shadow-lg shadow-primary/40"
          >
            {bookMutation.isPending && <Loader2 className="animate-spin" />}
            {ctaLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
