import type { DeviceStatus } from "./devices-api";

export const DEVICE_STATUS_LABEL: Record<
  DeviceStatus,
  { label: string; className: string }
> = {
  available: { label: "Còn hàng", className: "bg-emerald-500/15 text-emerald-400" },
  rented: { label: "Đang cho thuê", className: "bg-amber-500/15 text-amber-400" },
  maintenance: { label: "Bảo trì", className: "bg-muted text-muted-foreground" },
  broken: { label: "Ngừng cho thuê", className: "bg-destructive/15 text-destructive" },
};

export function formatVnd(value: string | number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function formatDateTimeVi(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Tên field specs (camelCase/snake_case) -> nhãn tiếng Việt dễ đọc, xem prisma/seed.ts backend. */
const SPEC_LABEL_MAP: Record<string, string> = {
  anc: "Chống ồn chủ động",
  backlight: "Đèn nền",
  battery: "Pin",
  bluetooth: "Bluetooth",
  brightness: "Độ sáng",
  buttons: "Số nút",
  camera: "Camera",
  chip: "Chip xử lý",
  colorTemp: "Nhiệt độ màu",
  connect: "Kết nối",
  control: "Điều khiển",
  cpu: "Vi xử lý",
  display: "Màn hình",
  flightTime: "Thời gian bay",
  gpu: "Card đồ hoạ",
  inputs: "Cổng vào",
  mode: "Chế độ",
  mount: "Ngàm gắn",
  pattern: "Hướng thu âm",
  ports: "Cổng kết nối",
  power: "Công suất",
  ram: "Bộ nhớ RAM",
  resolution: "Độ phân giải",
  screen: "Màn hình",
  sensor: "Cảm biến",
  smartTv: "Smart TV",
  stabilization: "Chống rung",
  storage: "Bộ nhớ trong",
  style: "Kiểu dáng",
  switch: "Loại switch",
  throughput: "Tốc độ truyền tải",
  touch: "Cảm ứng",
  tracking: "Theo dõi chuyển động",
  type: "Loại",
  video: "Video",
  waterproof: "Chống nước",
  weight: "Trọng lượng",
  wifi: "Wi-Fi",
};

/** Fallback khi field không có trong bảng ánh xạ: tách camelCase/snake_case rồi viết hoa chữ đầu. */
function humanizeSpecKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function specLabel(key: string): string {
  return SPEC_LABEL_MAP[key] ?? humanizeSpecKey(key);
}
