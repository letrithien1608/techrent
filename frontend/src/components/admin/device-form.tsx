"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormErrorBanner } from "@/components/form-error-banner";
import { ImageDropzone } from "@/components/admin/image-dropzone";
import {
  createDevice,
  updateDevice,
  uploadDeviceImages,
  type DevicePayload,
} from "@/lib/admin-api";
import { fetchCategories, type Device } from "@/lib/devices-api";
import { DEVICE_STATUS_LABEL } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

interface DeviceFormMutationResult {
  device: Device;
  imageUploadFailed: boolean;
}

interface SpecRow {
  id: string;
  key: string;
  value: string;
}

type FieldErrors = Partial<
  Record<"name" | "categoryId" | "pricePerHour" | "pricePerDay" | "originalPrice" | "images", string>
>;

// Đồng bộ ĐÚNG số tối thiểu backend validate (`@ArrayMinSize(5)` ở
// CreateDeviceDto/UpdateDeviceDto) — chặn ở FE để UX rõ ràng hơn, nhưng
// backend mới là lớp chặn thật (xem CLAUDE.md nguyên tắc bảo mật/nghiệp vụ).
const MIN_DEVICE_IMAGES = 5;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
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
  const [originalPrice, setOriginalPrice] = useState(device?.originalPrice ?? "");
  const [detailedDescription, setDetailedDescription] = useState(
    device?.detailedDescription ?? "",
  );
  const [status, setStatus] = useState(device?.status ?? "available");
  const [specRows, setSpecRows] = useState<SpecRow[]>(() => specsToRows(device?.specs ?? null));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Chỉ dùng khi TẠO MỚI — gộp bước chọn ảnh ngay vào form tạo thiết bị thay vì
  // bắt admin phải tự nhận ra còn 1 bước ẩn ở trang sửa sau khi tạo xong.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const previews = useMemo(
    () => pendingFiles.map((file) => URL.createObjectURL(file)),
    [pendingFiles],
  );
  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });

  const mutation = useMutation({
    mutationFn: async (payload: DevicePayload): Promise<DeviceFormMutationResult> => {
      if (isEdit) {
        return { device: await updateDevice(device!.id, payload), imageUploadFailed: false };
      }
      const created = await createDevice(payload);
      if (pendingFiles.length === 0) {
        return { device: created, imageUploadFailed: false };
      }
      try {
        const withImages = await uploadDeviceImages(created.id, pendingFiles);
        return { device: withImages, imageUploadFailed: false };
      } catch {
        // Thiết bị ĐÃ tạo thành công lúc này — không throw ở đây để tránh
        // mutation rơi vào onError khiến admin tưởng nhầm tạo thiết bị thất
        // bại rồi bấm submit lại, tạo trùng thiết bị. Chỉ báo riêng lỗi ảnh.
        return { device: created, imageUploadFailed: true };
      }
    },
    onSuccess: ({ device: result, imageUploadFailed }) => {
      if (isEdit) {
        toast.success("Đã lưu thay đổi");
        router.push("/admin/devices");
        return;
      }
      if (imageUploadFailed) {
        toast.error(
          "Đã tạo thiết bị nhưng tải ảnh lên thất bại — vui lòng thử tải lại ở trang sửa vừa mở.",
        );
      } else if (pendingFiles.length > 0) {
        toast.success("Đã tạo thiết bị và tải ảnh thành công");
      } else {
        toast.success("Đã tạo thiết bị — bạn có thể thêm ảnh ngay bên dưới");
      }
      router.push(`/admin/devices/${result.id}/edit`);
    },
    onError: (error) => {
      setServerError(getErrorMessage(error, "Không thể lưu thiết bị, vui lòng thử lại"));
    },
  });

  function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    setPendingFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function addSpecRow() {
    setSpecRows((rows) => [...rows, { id: crypto.randomUUID(), key: "", value: "" }]);
  }

  function updateSpecRow(id: string, field: "key" | "value", value: string) {
    setSpecRows((rows) => rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  function removeSpecRow(id: string) {
    setSpecRows((rows) => rows.filter((row) => row.id !== id));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!name.trim() || name.trim().length < 2) {
      errors.name = "Tên thiết bị phải có ít nhất 2 ký tự";
    }
    if (!categoryId) {
      errors.categoryId = "Vui lòng chọn danh mục";
    }
    const hourNumber = Number(pricePerHour);
    if (!pricePerHour || Number.isNaN(hourNumber) || hourNumber < 0) {
      errors.pricePerHour = "Giá theo giờ không hợp lệ";
    }
    const dayNumber = Number(pricePerDay);
    if (!pricePerDay || Number.isNaN(dayNumber) || dayNumber < 0) {
      errors.pricePerDay = "Giá theo ngày không hợp lệ";
    }
    const originalNumber = Number(originalPrice);
    if (!originalPrice || Number.isNaN(originalNumber) || originalNumber < 0) {
      errors.originalPrice = "Giá gốc không hợp lệ";
    }
    // Chỉ chặn ở bước TẠO MỚI — ảnh của thiết bị đang SỬA không quản lý qua
    // form này (xem DeviceImageManager ở trang edit), nên không có gì để đếm.
    if (!isEdit && pendingFiles.length < MIN_DEVICE_IMAGES) {
      errors.images = `Vui lòng chọn tối thiểu ${MIN_DEVICE_IMAGES} ảnh (đang chọn ${pendingFiles.length})`;
    }
    return errors;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setServerError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    mutation.mutate({
      name: name.trim(),
      categoryId,
      pricePerHour: Number(pricePerHour),
      pricePerDay: Number(pricePerDay),
      originalPrice: Number(originalPrice),
      detailedDescription: detailedDescription.trim() || undefined,
      specs: rowsToSpecs(specRows),
      ...(isEdit ? { status: status as Device["status"] } : {}),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {serverError && <FormErrorBanner message={serverError} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="device-name">Tên thiết bị</Label>
          <Input
            id="device-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: MacBook Pro 14 M3"
            aria-invalid={!!fieldErrors.name}
          />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Danh mục</Label>
          <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
            <SelectTrigger className="w-full" aria-invalid={!!fieldErrors.categoryId}>
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
          <FieldError message={fieldErrors.categoryId} />
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
            aria-invalid={!!fieldErrors.pricePerHour}
          />
          <FieldError message={fieldErrors.pricePerHour} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="device-price-day">Giá theo ngày (VNĐ)</Label>
          <Input
            id="device-price-day"
            type="number"
            min={0}
            value={pricePerDay}
            onChange={(e) => setPricePerDay(e.target.value)}
            aria-invalid={!!fieldErrors.pricePerDay}
          />
          <FieldError message={fieldErrors.pricePerDay} />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="device-original-price">Giá gốc / giá trị tài sản (VNĐ)</Label>
          <Input
            id="device-original-price"
            type="number"
            min={0}
            value={originalPrice}
            onChange={(e) => setOriginalPrice(e.target.value)}
            placeholder="VD: 45000000"
            aria-invalid={!!fieldErrors.originalPrice}
          />
          <p className="text-xs text-muted-foreground">
            Dùng để tính tiền cọc (50% giá gốc) và hiển thị minh bạch cho khách — KHÁC giá thuê ở trên.
          </p>
          <FieldError message={fieldErrors.originalPrice} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="device-detailed-description">Mô tả chi tiết (không bắt buộc)</Label>
        <Textarea
          id="device-detailed-description"
          value={detailedDescription}
          onChange={(e) => setDetailedDescription(e.target.value)}
          placeholder="Tình trạng máy, phụ kiện đi kèm, năm sản xuất, bảo hành còn lại..."
          rows={4}
        />
      </div>

      <div className="rounded-xl border border-border/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Thông số kỹ thuật</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tuỳ ý theo từng danh mục — VD laptop: cpu, ram, storage
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSpecRow}>
            <Plus /> Thêm dòng
          </Button>
        </div>
        {specRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Chưa có thông số nào — bấm &quot;Thêm dòng&quot; để thêm.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
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

      {!isEdit && (
        <div>
          <Label>Ảnh thiết bị (tối thiểu {MIN_DEVICE_IMAGES} ảnh)</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Mỗi thiết bị cần tối thiểu {MIN_DEVICE_IMAGES} ảnh để khách xem rõ trước khi thuê.
          </p>
          <ImageDropzone
            onFilesSelected={handleFilesSelected}
            hint="Tối đa 8 ảnh, mỗi ảnh không quá 5MB"
            className="mt-2"
          />
          <FieldError message={fieldErrors.images} />
          {previews.length > 0 && (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Đã chọn {previews.length}/{MIN_DEVICE_IMAGES} ảnh tối thiểu
              </p>
              <div className="mt-1 grid grid-cols-4 gap-3 sm:grid-cols-6">
                {previews.map((src, index) => (
                  <div
                    key={src}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL xem trước cục bộ, next/image chỉ nhận domain đã whitelist */}
                    <img
                      src={src}
                      alt={`Xem trước ${index + 1}`}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingFile(index)}
                      aria-label="Bỏ ảnh này"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

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
