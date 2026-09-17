"use client";

import { cn } from "cn";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/devices/star-rating";
import { DEVICE_STATUS_LABEL, formatVnd } from "@/lib/device-format";
import type { Device } from "@/lib/devices-api";

interface Props {
  device: Device;
  avgRating: number;
  reviewCount: number;
}

export function DeviceBookingPanel({ device, avgRating, reviewCount }: Props) {
  const [priceMode, setPriceMode] = useState<"day" | "hour">("day");
  const isAvailable = device.status === "available";
  const status = DEVICE_STATUS_LABEL[device.status];
  const activePrice = priceMode === "day" ? device.pricePerDay : device.pricePerHour;
  const activeUnit = priceMode === "day" ? "/ngày" : "/giờ";

  return (
    <div className="lg:sticky lg:top-20 lg:self-start">
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-foreground">
          Trang chủ
        </Link>
        <ChevronRight className="size-3.5 shrink-0" />
        <Link href="/devices" className="transition-colors hover:text-foreground">
          {device.category.name}
        </Link>
        <ChevronRight className="size-3.5 shrink-0" />
        <span className="truncate text-foreground">{device.name}</span>
      </nav>

      <h1 className="mt-3 text-balance font-heading text-3xl font-bold tracking-tight sm:text-4xl">
        {device.name}
      </h1>

      <div className="mt-2 flex items-center gap-2">
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
      </div>

      <div className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-border/60 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setPriceMode("day")}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-colors",
                priceMode === "day"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Theo ngày
            </button>
            <button
              type="button"
              onClick={() => setPriceMode("hour")}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-colors",
                priceMode === "hour"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Theo giờ
            </button>
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

        <p className="mt-4 font-heading text-3xl font-bold tracking-tight">
          {formatVnd(activePrice)}
          <span className="text-base font-normal text-muted-foreground">
            {activeUnit}
          </span>
        </p>

        {/* Placeholder chọn ngày/giờ — chưa submit thật, chỉ dựng UI trước */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/60 p-2.5">
            <p className="text-xs text-muted-foreground">Bắt đầu</p>
            <p className="text-sm font-medium">Chọn ngày, giờ</p>
          </div>
          <div className="rounded-lg border border-border/60 p-2.5">
            <p className="text-xs text-muted-foreground">Kết thúc</p>
            <p className="text-sm font-medium">Chọn ngày, giờ</p>
          </div>
        </div>

        <Button
          size="lg"
          disabled={!isAvailable}
          className="mt-5 w-full shadow-lg shadow-primary/40 hover:shadow-primary/60"
        >
          {isAvailable ? "Đặt thuê ngay" : "Hết hàng"}
        </Button>
        {!isAvailable && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Hiện đang hết hàng, vui lòng quay lại sau
          </p>
        )}
      </div>

      {/* Mobile: thanh cố định dưới cùng màn hình thay cho sidebar sticky */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <p className="font-heading text-lg font-bold">
            {formatVnd(device.pricePerDay)}
            <span className="text-sm font-normal text-muted-foreground">
              /ngày
            </span>
          </p>
          <Button
            size="lg"
            disabled={!isAvailable}
            className="shadow-lg shadow-primary/40"
          >
            {isAvailable ? "Đặt thuê ngay" : "Hết hàng"}
          </Button>
        </div>
      </div>
    </div>
  );
}
