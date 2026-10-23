import { specLabel } from "@/lib/device-format";
import type { SpecSheetEntry, SpecTemplateGroup } from "@/lib/devices-api";

/** Nhóm cho thông số không có trong mẫu của danh mục (khớp backend OTHER_SPEC_GROUP). */
export const OTHER_SPEC_GROUP = "Thông số khác";

export interface SpecGroup {
  group: string;
  entries: SpecSheetEntry[];
}

/**
 * Bảng thông số để hiển thị: ưu tiên `specSheet` (đã có nhóm), thiết bị cũ chỉ
 * có `specs` key-value thì gom hết vào 1 nhóm "Thông số".
 */
export function toSpecGroups(
  specSheet: SpecSheetEntry[] | null | undefined,
  legacySpecs: Record<string, unknown> | null,
): SpecGroup[] {
  if (specSheet && specSheet.length > 0) {
    const groups: SpecGroup[] = [];
    for (const entry of specSheet) {
      const last = groups.at(-1);
      if (last && last.group === entry.group) last.entries.push(entry);
      else groups.push({ group: entry.group, entries: [entry] });
    }
    return groups;
  }

  const legacy = Object.entries(legacySpecs ?? {}).map(([key, value]) => ({
    group: "Thông số",
    label: specLabel(key),
    value: String(value),
  }));
  return legacy.length > 0 ? [{ group: "Thông số", entries: legacy }] : [];
}

/** Dựng bảng thông số theo đúng thứ tự mẫu; ô trống bị bỏ qua. */
export function buildSpecSheet(
  template: SpecTemplateGroup[],
  values: Record<string, string>,
  extras: { label: string; value: string }[],
): SpecSheetEntry[] {
  const sheet: SpecSheetEntry[] = [];
  for (const { group, fields } of template) {
    for (const label of fields) {
      const value = values[label]?.trim();
      if (value) sheet.push({ group, label, value });
    }
  }
  for (const extra of extras) {
    const label = extra.label.trim();
    const value = extra.value.trim();
    if (label && value) sheet.push({ group: OTHER_SPEC_GROUP, label, value });
  }
  return sheet;
}

export function templateLabels(template: SpecTemplateGroup[]): Set<string> {
  return new Set(template.flatMap((group) => group.fields));
}
