import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DeviceCard } from "@/components/devices/device-card";
import type { Device } from "@/lib/devices-api";

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
