"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminBackButton } from "@/components/admin/admin-back-button";
import { DeviceForm } from "@/components/admin/device-form";
import { DeviceImageManager } from "@/components/admin/device-image-manager";
import { fetchDevice } from "@/lib/devices-api";

export function EditDeviceView({ deviceId }: { deviceId: string }) {
  const query = useQuery({
    queryKey: ["admin", "device", deviceId],
    queryFn: () => fetchDevice(deviceId),
  });

  if (query.isPending) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 py-20 text-center">
        <WifiOff className="size-10 text-muted-foreground/50" />
        <p className="text-muted-foreground">
          Không tìm thấy thiết bị hoặc không thể tải dữ liệu.
        </p>
        <Button nativeButton={false} render={<Link href="/admin/devices" />}>
          Về danh sách thiết bị
        </Button>
      </div>
    );
  }

  const device = query.data;

  return (
    <div className="space-y-8">
      <div>
        <AdminBackButton href="/admin/devices" label="Quay lại danh sách thiết bị" />
        <DeviceForm device={device} />
      </div>
      <div className="max-w-2xl border-t border-border/60 pt-6">
        <h2 className="font-heading text-base font-semibold">Ảnh thiết bị</h2>
        <div className="mt-3">
          <DeviceImageManager device={device} />
        </div>
      </div>
    </div>
  );
}
