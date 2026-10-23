/** 1 nhóm trong mẫu thông số của danh mục, VD { group: 'Màn hình', fields: ['Kích thước', ...] }. */
export interface SpecTemplateGroup {
  group: string;
  fields: string[];
}

/** 1 dòng thông số kỹ thuật của thiết bị. */
export interface SpecSheetEntry {
  group: string;
  label: string;
  value: string;
}

/** Nhóm dành cho thông số không nằm trong mẫu của danh mục (tên khác hẳn các nhóm trong mẫu). */
export const OTHER_SPEC_GROUP = 'Thông số khác';

/**
 * Dựng bảng thông số theo đúng thứ tự mẫu của danh mục từ map label → giá trị.
 * Ô trống bị bỏ qua (không bịa giá trị). Label không có trong mẫu đưa vào nhóm
 * "Khác" để không mất dữ liệu.
 */
export function buildSpecSheet(
  template: SpecTemplateGroup[] | null | undefined,
  values: Record<string, string>,
): SpecSheetEntry[] {
  const entries: SpecSheetEntry[] = [];
  const used = new Set<string>();

  for (const { group, fields } of template ?? []) {
    for (const label of fields) {
      const value = values[label]?.trim();
      if (!value) continue;
      entries.push({ group, label, value });
      used.add(label);
    }
  }

  for (const [label, raw] of Object.entries(values)) {
    const value = raw?.trim();
    if (used.has(label) || !value) continue;
    entries.push({ group: OTHER_SPEC_GROUP, label, value });
  }

  return entries;
}

/** Dạng phẳng label → giá trị — dùng đồng bộ ngược sang cột `specs` cũ. */
export function flattenSpecSheet(
  sheet: SpecSheetEntry[],
): Record<string, string> {
  return Object.fromEntries(sheet.map((entry) => [entry.label, entry.value]));
}

/** Đọc an toàn cột JSON `specSheet` (có thể null hoặc dữ liệu cũ sai dạng). */
export function parseSpecSheet(raw: unknown): SpecSheetEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is SpecSheetEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as SpecSheetEntry).group === 'string' &&
      typeof (entry as SpecSheetEntry).label === 'string' &&
      typeof (entry as SpecSheetEntry).value === 'string',
  );
}
