"use client";

import { cn } from "cn";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Pencil, Plus, Search, Trash2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { deleteDevice } from "@/lib/admin-api";
import {
  fetchCategories,
  fetchDevices,
  type DeviceStatus,
} from "@/lib/devices-api";
import { DEVICE_STATUS_LABEL, formatVnd } from "@/lib/device-format";

const PAGE_SIZE = 10;

export default function AdminDevicesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const devicesQuery = useQuery({
    queryKey: ["admin", "devices", page, search, categoryId, status],
    queryFn: () =>
      fetchDevices({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        categoryId: categoryId === "all" ? undefined : categoryId,
        status: status === "all" ? undefined : (status as DeviceStatus),
      }),
  });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["admin", "devices"] });
  }

  const result = devicesQuery.data?.result;
  const devices = result?.data ?? [];
  const hasError = devicesQuery.isError || devicesQuery.data?.hasError;
  const hasActiveFilters = search !== "" || categoryId !== "all" || status !== "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên thiết bị..."
              className="w-56 pl-8"
            />
          </div>
          <Select
            value={categoryId}
            onValueChange={(value) => {
              setCategoryId(value ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả danh mục</SelectItem>
              {(categoriesQuery.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mọi trạng thái</SelectItem>
              {Object.entries(DEVICE_STATUS_LABEL).map(([value, meta]) => (
                <SelectItem key={value} value={value}>
                  {meta.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button nativeButton={false} render={<Link href="/admin/devices/new" />}>
          <Plus /> Thêm thiết bị
        </Button>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
        {devicesQuery.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : hasError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách thiết bị.</p>
            <Button onClick={() => devicesQuery.refetch()}>Thử lại</Button>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {hasActiveFilters
                ? "Không có thiết bị khớp với bộ lọc."
                : "Chưa có thiết bị nào."}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Danh mục</TableHead>
                  <TableHead>Giá/ngày</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => {
                  const statusMeta = DEVICE_STATUS_LABEL[device.status];
                  const image = device.images?.[0];
                  return (
                    <TableRow key={device.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {image ? (
                              <Image src={image} alt={device.name} fill sizes="40px" className="object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                <Package className="size-4" />
                              </div>
                            )}
                          </div>
                          <span className="max-w-[220px] truncate font-medium">
                            {device.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {device.category.name}
                      </TableCell>
                      <TableCell>{formatVnd(device.pricePerDay)}</TableCell>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            nativeButton={false}
                            render={<Link href={`/admin/devices/${device.id}/edit`} />}
                            aria-label="Sửa"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <ConfirmDeleteDialog
                            title="Xoá thiết bị này?"
                            description={`Thiết bị "${device.name}" sẽ bị xoá khỏi hệ thống. Hành động không thể hoàn tác.`}
                            onConfirm={() => deleteDevice(device.id)}
                            onDeleted={handleChanged}
                            successMessage="Đã xoá thiết bị"
                          >
                            <Trash2 className="size-4" />
                          </ConfirmDeleteDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-3">
              <AdminPagination
                page={page}
                totalPages={result?.meta.totalPages ?? 1}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
