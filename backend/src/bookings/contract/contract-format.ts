// Định dạng dùng trong hợp đồng: ngày giờ dd/MM/yyyy HH:mm theo giờ Việt Nam,
// tiền "1.320.000 đ", escape HTML cho mọi chuỗi động.

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

function parts(date: Date): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    result[part.type] = part.value;
  }
  return result;
}

/** "05/11/2026 09:00" (giờ Việt Nam). */
export function formatDateTime(date: Date): string {
  const p = parts(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** "05/11/2026" (giờ Việt Nam). */
export function formatDate(date: Date): string {
  const p = parts(date);
  return `${p.day}/${p.month}/${p.year}`;
}

/** { day, month, year } để viết "ngày 05 tháng 11 năm 2026". */
export function dateParts(date: Date): {
  day: string;
  month: string;
  year: string;
} {
  const p = parts(date);
  return { day: p.day, month: p.month, year: p.year };
}

/** "1.320.000 đ" — tách nghìn bằng dấu chấm, có khoảng trắng trước "đ". */
export function formatMoney(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${digits} đ`;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape + chuẩn hoá NFC (dấu tiếng Việt dựng sẵn — tránh vỡ dấu khi in). */
export function esc(value: unknown): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Ảnh Cloudinary thu nhỏ cho phụ lục (giảm dung lượng PDF). */
export function thumbnail(url: string): string {
  return url.includes('res.cloudinary.com') && url.includes('/upload/')
    ? url.replace('/upload/', '/upload/c_fill,w_240,h_180,q_auto,f_jpg/')
    : url;
}
