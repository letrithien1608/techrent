"use client";

import { cn } from "cn";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, PlayCircle, Wrench, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  fetchMaintenance,
  updateMaintenanceStatus,
  type MaintenanceStatus,
} from "@/lib/admin-api";
import { fetchDevices } from "@/lib/devices-api";
import { formatDateTimeVi } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

const PAGE_SIZE = 10;

const STATUS_LABEL: Record<MaintenanceStatus, { label: string; className: string }> = {
  open: { label: "Mới báo", className: "bg-destructive/15 text-destructive" },
  in_progress: { label: "Đang xử lý", className: "bg-amber-500/15 text-amber-400" },
  resolved: { label: "Đã xử lý", className: "bg-emerald-500/15 text-emerald-400" },
};

const FILTERS: { value: MaintenanceStatus | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "open", label: "Mới báo" },
  { value: "in_progress", label: "Đang xử lý" },
  { value: "resolved", label: "Đã xử lý" },
];

export default function AdminMaintenancePage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<MaintenanceStatus | "all">("all");

  const maintenanceQuery = useQuery({
    queryKey: ["admin", "maintenance", page, status],
    queryFn: () =>
      fetchMaintenance({
        page,
        limit: PAGE_SIZE,
        status: status === "all" ? undefined : status,
      }),
  });

  // Maintenance record chỉ có `deviceId` thô (không include quan hệ) — lấy danh
  // sách thiết bị để tra tên hiển thị, KHÔNG cần sửa backend cho 1 trang phụ này.
  const devicesQuery = useQuery({
    queryKey: ["admin", "devices", "lookup"],
    queryFn: () => fetchDevices({ limit: 100 }),
  });

  const deviceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const device of devicesQuery.data?.result?.data ?? []) {
      map.set(device.id, device.name);
    }
    return map;
  }, [devicesQuery.data]);

  const mutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: MaintenanceStatus }) =>
      updateMaintenanceStatus(id, next),
    onSuccess: () => {
      toast.success("Đã cập nhật trạng thái xử lý");
      queryClient.invalidateQueries({ queryKey: ["admin", "maintenance"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể cập nhật, vui lòng thử lại"));
    },
  });

  const records = maintenanceQuery.data?.data ?? [];
  const meta = maintenanceQuery.data?.meta;

  return (
    <div className="space-y-4">
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value as MaintenanceStatus | "all");
          setPage(1);
        }}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FILTERS.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
        {maintenanceQuery.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : maintenanceQuery.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách báo hỏng.</p>
            <Button onClick={() => maintenanceQuery.refetch()}>Thử lại</Button>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Wrench className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Không có báo cáo sự cố nào.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Sự cố</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Xử lý xong lúc</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const statusMeta = STATUS_LABEL[record.status];
                  const isMutatingThis =
                    mutation.isPending && mutation.variables?.id === record.id;
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="max-w-[180px] truncate font-medium">
                        {deviceNameById.get(record.deviceId) ?? record.deviceId}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-muted-foreground">
                        {record.issue}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            statusMeta.className,
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {record.resolvedAt ? formatDateTimeVi(record.resolvedAt) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {record.status === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isMutatingThis}
                            onClick={() =>
                              mutation.mutate({ id: record.id, next: "in_progress" })
                            }
                          >
                            {isMutatingThis ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <PlayCircle />
                            )}
                            Bắt đầu xử lý
                          </Button>
                        )}
                        {record.status === "in_progress" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isMutatingThis}
                            onClick={() => mutation.mutate({ id: record.id, next: "resolved" })}
                          >
                            {isMutatingThis ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <CheckCircle2 />
                            )}
                            Đã xử lý xong
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-3">
              <AdminPagination
                page={page}
                totalPages={meta?.totalPages ?? 1}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
