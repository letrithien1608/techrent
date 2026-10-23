"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SpecTemplateGroup } from "@/lib/devices-api";

export interface ExtraSpecRow {
  id: string;
  label: string;
  value: string;
}

/**
 * Nhập thông số theo mẫu của danh mục (mỗi nhóm 1 khối ô nhập), cộng phần
 * "Thông số khác" cho những gì mẫu chưa có. Ô để trống thì không lưu.
 */
export function SpecSheetEditor({
  template,
  values,
  onValueChange,
  extras,
  onExtrasChange,
}: {
  template: SpecTemplateGroup[];
  values: Record<string, string>;
  onValueChange: (label: string, value: string) => void;
  extras: ExtraSpecRow[];
  onExtrasChange: (rows: ExtraSpecRow[]) => void;
}) {
  function updateExtra(id: string, field: "label" | "value", value: string) {
    onExtrasChange(extras.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  }

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <Label>Thông số kỹ thuật</Label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {template.length > 0
          ? "Theo mẫu của danh mục. Chỉ điền thông số đã kiểm tra từ trang hãng — không chắc thì để trống."
          : "Chọn danh mục để hiện mẫu thông số."}
      </p>

      <div className="mt-4 space-y-5">
        {template.map((group) => (
          <fieldset key={group.group}>
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.group}
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.fields.map((label) => {
                const inputId = `spec-${group.group}-${label}`;
                return (
                  <div key={label} className="flex flex-col gap-1">
                    <Label htmlFor={inputId} className="text-xs font-normal">
                      {label}
                    </Label>
                    <Input
                      id={inputId}
                      value={values[label] ?? ""}
                      onChange={(e) => onValueChange(label, e.target.value)}
                      maxLength={300}
                    />
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}

        <fieldset>
          <div className="flex items-center justify-between">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Thông số khác
            </legend>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onExtrasChange([...extras, { id: crypto.randomUUID(), label: "", value: "" }])
              }
            >
              <Plus /> Thêm dòng
            </Button>
          </div>
          {extras.length > 0 && (
            <div className="mt-2 space-y-2">
              {extras.map((row) => (
                <div key={row.id} className="flex gap-2">
                  <Input
                    value={row.label}
                    onChange={(e) => updateExtra(row.id, "label", e.target.value)}
                    placeholder="Tên thông số"
                    aria-label="Tên thông số"
                    maxLength={60}
                    className="flex-1"
                  />
                  <Input
                    value={row.value}
                    onChange={(e) => updateExtra(row.id, "value", e.target.value)}
                    placeholder="Giá trị"
                    aria-label="Giá trị"
                    maxLength={300}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onExtrasChange(extras.filter((item) => item.id !== row.id))}
                    aria-label="Xoá dòng"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </fieldset>
      </div>
    </div>
  );
}
