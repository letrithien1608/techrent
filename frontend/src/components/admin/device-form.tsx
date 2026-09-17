"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormErrorBanner } from "@/components/form-error-banner";
import { createDevice, updateDevice, type DevicePayload } from "@/lib/admin-api";
import { fetchCategories, type Device } from "@/lib/devices-api";
import { DEVICE_STATUS_LABEL } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

interface SpecRow {
  id: string;
  key: string;
  value: string;
}

function specsToRows(specs: Record<string, unknown> | null): SpecRow[] {
  if (!specs) return [];
  return Object.entries(specs).map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value: String(value),
  }));
}

function rowsToSpecs(rows: SpecRow[]): Record<string, string> {
  const specs: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    specs[key] = row.value;
  }
  return specs;
}

export function DeviceForm({ device }: { device?: Device }) {
  const router = useRouter();
  const isEdit = !!device;

  const [name, setName] = useState(device?.name ?? "");
  const [categoryId, setCategoryId] = useState(device?.categoryId ?? "");
  const [pricePerHour, setPricePerHour] = useState(device?.pricePerHour ?? "");
  const [pricePerDay, setPricePerDay] = useState(device?.pricePerDay ?? "");
  const [status, setStatus] = useState(device?.status ?? "available");
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => specsToRows(device?.specs ?? null));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });

  const mutation = useMutation({
    mutationFn: async (payload: DevicePayload) =>
      isEdit ? updateDevice(device!.id, payload) : createDevice(payload),
    onSuccess: (result) => {
      toast.success(isEdit ? "Đã lưu thay đổi" : "Đã tạo thiết bị mới");
      if (isEdit) {
        router.push("/admin/devices");
      } else {
        router.push(`/admin/devices/${result.id}/edit`);
      }
    },
    onError: (error) => {
      setErrorMessage(getErrorMessage(error, "Không thể lưu thiết bị, vui lòng thử lại"));
    },
  });

  function addSpecRow() {
    setSpecRows((rows) => [...rows, { id: crypto.randomUUID(), key: "", value: "" }]);
  }

  function updateSpecRow(id: string, field: "key" | "value", value: string) {
    setSpecRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function removeSpecRow(id: string) {
    setSpecRows((rows) => rows.filter((row) => row.id !== id));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || name.trim().length < 2) {
      setErrorMessage("Tên thiết bị phải có ít nhất 2 ký tự");
      return;
    }
    if (!categoryId) {
      setErrorMessage("Vui lòng chọn danh mục");
      return;
    }
    const hourNumber = Number(pricePerHour);
    const dayNumber = Number(pricePerDay);
    if (!pricePerHour || Number.isNaN(hourNumber) || hourNumber < 0) {
      setErrorMessage("Giá theo giờ không hợp lệ");
      return;
    }
    if (!pricePerDay || Number.isNaN(dayNumber) || dayNumber < 0) {
      setErrorMessage("Giá theo ngày không hợp lệ");
      return;
    }

    mutation.mutate({
      name: name.trim(),
      categoryId,
      pricePerHour: hourNumber,
      pricePerDay: dayNumber,
      specs: rowsToSpecs(specRows),
      ...(isEdit ? { status: status as Device["status"] } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {errorMessage && <FormErrorBanner message={errorMessage} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="device-name">Tên thiết bị</Label>
          <Input
            id="device-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: MacBook Pro 14 M3"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Danh mục</Label>
          <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Chọn danh mục" />
            </SelectTrigger>
            <SelectContent>
              {(categoriesQuery.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isEdit && (
          <div className="flex flex-col gap-1.5">
            <Label>Trạng thái</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Device["status"])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DEVICE_STATUS_LABEL).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-price-hour">Giá theo giờ (VNĐ)</Label>
          <Input
            id="device-price-hour"
            type="number"
            min={0}
            value={pricePerHour}
            onChange={(e) => setPricePerHour(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-price-day">Giá theo ngày (VNĐ)</Label>
          <Input
            id="device-price-day"
            type="number"
            min={0}
            value={pricePerDay}
            onChange={(e) => setPricePerDay(e.target.value)}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label>Thông số kỹ thuật</Label>
          <Button type="button" variant="outline" size="sm" onClick={addSpecRow}>
            <Plus /> Thêm dòng
          </Button>
        </div>
        {specRows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Chưa có thông số nào — bấm &quot;Thêm dòng&quot; để thêm (VD: cpu, ram, storage...).
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {specRows.map((row) => (
              <div key={row.id} className="flex gap-2">
                <Input
                  value={row.key}
                  onChange={(e) => updateSpecRow(row.id, "key", e.target.value)}
                  placeholder="Tên thông số (VD: cpu)"
                  className="flex-1"
                />
                <Input
                  value={row.value}
                  onChange={(e) => updateSpecRow(row.id, "value", e.target.value)}
                  placeholder="Giá trị (VD: Apple M3 Pro)"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeSpecRow(row.id)}
                  aria-label="Xoá dòng"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          {isEdit ? "Lưu thay đổi" : "Tạo thiết bị"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/devices")}
          disabled={mutation.isPending}
        >
          Huỷ
        </Button>
      </div>
    </form>
  );
}
