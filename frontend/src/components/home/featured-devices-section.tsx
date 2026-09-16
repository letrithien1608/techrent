import { cn } from "cn";
import { Package } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Device, DeviceStatus } from "@/lib/devices-api";

const STATUS_LABEL: Record<DeviceStatus, { label: string; className: string }> = {
  available: { label: "Còn hàng", className: "bg-emerald-500/15 text-emerald-400" },
  rented: { label: "Đang cho thuê", className: "bg-amber-500/15 text-amber-400" },
  maintenance: { label: "Bảo trì", className: "bg-muted text-muted-foreground" },
  broken: { label: "Ngừng cho thuê", className: "bg-destructive/15 text-destructive" },
};

function formatVnd(value: string): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function DeviceCard({ device }: { device: Device }) {
  const status = STATUS_LABEL[device.status];
  const image = device.images?.[0];

  return (
    <Link
      href={`/devices/${device.id}`}
      className="group block overflow-hidden rounded-2xl border border-border/60 bg-card/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {image ? (
          <Image
            src={image}
            alt={device.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <Package className="size-10" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <span
          className={cn(
            "absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur",
            status.className,
          )}
        >
          {status.label}
        </span>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-4">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-white/70">
              {device.category.name}
            </p>
            <h3 className="truncate font-heading font-semibold text-white">
              {device.name}
            </h3>
          </div>
          <p className="shrink-0 text-right text-sm font-semibold text-white">
            {formatVnd(device.pricePerHour)}
            <span className="block text-xs font-normal text-white/70">
              /giờ
            </span>
          </p>
        </div>
      </div>
    </Link>
  );
}

export function FeaturedDevicesSection({
  devices,
  hasError,
}: {
  devices: Device[];
  hasError: boolean;
}) {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Thiết bị nổi bật
          </h2>
          <p className="mt-3 text-muted-foreground">
            Một vài lựa chọn được quan tâm nhiều nhất gần đây.
          </p>
        </div>

        <div className="mt-12">
          {hasError ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center text-muted-foreground">
              Không thể tải danh sách thiết bị lúc này — vui lòng thử lại sau.
            </div>
          ) : devices.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-16 text-center text-muted-foreground">
              Chưa có thiết bị nào được đăng — quay lại sau nhé.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {devices.map((device) => (
                <DeviceCard key={device.id} device={device} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 flex justify-center">
          <Button
            variant="outline"
            size="lg"
            nativeButton={false}
            render={<Link href="/devices" />}
          >
            Xem tất cả thiết bị →
          </Button>
        </div>
      </div>
    </section>
  );
}
