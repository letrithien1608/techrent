import { cn } from "cn";
import { Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { DEVICE_STATUS_LABEL, formatVnd } from "@/lib/device-format";
import type { Device } from "@/lib/devices-api";

export function DeviceCard({ device }: { device: Device }) {
  const status = DEVICE_STATUS_LABEL[device.status];
  const image = device.images?.[0];

  return (
    <Link
      href={`/devices/${device.id}`}
      className="group block cursor-pointer overflow-hidden rounded-2xl border border-border/60 bg-card/50 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/20"
    >
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

      <div className="p-4">
        <h3 className="truncate font-heading font-semibold">{device.name}</h3>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {device.category.name}
        </p>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-heading text-lg font-bold text-foreground">
            {formatVnd(device.pricePerDay)}
          </span>
          <span className="text-sm text-muted-foreground">/ngày</span>
        </div>
        <p className="text-xs text-muted-foreground">
          hoặc {formatVnd(device.pricePerHour)}/giờ
        </p>
      </div>
    </Link>
  );
}
