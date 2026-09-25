"use client";

import { cn } from "cn";
import { Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, type MouseEvent } from "react";
import { StarRating } from "@/components/devices/star-rating";
import { DEVICE_STATUS_LABEL, formatVnd } from "@/lib/device-format";
import type { Device } from "@/lib/devices-api";

export function DeviceCard({ device }: { device: Device }) {
  const status = DEVICE_STATUS_LABEL[device.status];
  const image = device.images?.[0];
  const cardRef = useRef<HTMLAnchorElement>(null);

  // Hiệu ứng "spotlight" theo con trỏ chuột — set thẳng CSS custom property qua
  // ref (KHÔNG dùng React state) để tránh re-render cả cây component mỗi khi
  // chuột di chuyển, giữ animation mượt trong lưới nhiều card cùng lúc.
  function handleMouseMove(event: MouseEvent<HTMLAnchorElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    cardRef.current?.style.setProperty("--spot-x", `${event.clientX - rect.left}px`);
    cardRef.current?.style.setProperty("--spot-y", `${event.clientY - rect.top}px`);
  }

  return (
    <Link
      ref={cardRef}
      href={`/devices/${device.id}`}
      onMouseMove={handleMouseMove}
      className="group relative block cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card/50 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/20"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(240px circle at var(--spot-x, 50%) var(--spot-y, 50%), oklch(0.85 0.15 200 / 12%), transparent 70%)",
        }}
      />

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {image ? (
          <Image
            src={image}
            alt={device.name}
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Package className="size-10" />
          </div>
        )}

        {/* Overlay tối nhẹ đáy ảnh — giữ badge/chữ luôn đọc rõ dù ảnh sáng màu */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 via-black/0 to-transparent" />

        <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          {device.category.name}
        </span>
        <span
          className={cn(
            "absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur",
            status.className,
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="relative p-4">
        <h3 className="truncate font-heading text-base font-bold">{device.name}</h3>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {device.category.name}
          </p>
          {/* Chỉ hiện khi ĐÃ có ít nhất 1 đánh giá — ẩn hẳn thay vì hiện "0
              sao" (dễ gây hiểu lầm là thiết bị bị đánh giá thấp). */}
          {device.reviewCount > 0 && device.avgRating !== null && (
            <div className="flex shrink-0 items-center gap-1">
              <StarRating rating={device.avgRating} size={12} />
              <span className="text-xs text-muted-foreground">
                {device.avgRating.toFixed(1)} ({device.reviewCount})
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="bg-gradient-to-r from-primary to-cyan-300 bg-clip-text font-heading text-xl font-extrabold text-transparent">
            {formatVnd(device.pricePerDay)}
          </span>
          <span className="text-sm text-muted-foreground">/ngày</span>
        </div>
        <p className="text-xs text-muted-foreground/70">
          hoặc {formatVnd(device.pricePerHour)}/giờ
        </p>
      </div>
    </Link>
  );
}
