import { readFileSync } from 'fs';
import { join } from 'path';

// backend/assets/fonts — cùng đường dẫn tương đối từ src/bookings/contract
// (ts-node) và dist/bookings/contract (bản build).
const FONT_DIR = join(__dirname, '..', '..', '..', 'assets', 'fonts');

let cached: string | null = null;

/**
 * @font-face Noto Serif nhúng base64 (bộ ký tự vietnamese + latin) — bản xem
 * trong iframe, bản in và PDF phía server đều hiển thị đúng dấu tiếng Việt mà
 * không phụ thuộc font máy in hay mạng. Đọc file 1 lần rồi giữ trong bộ nhớ.
 */
export function loadContractFontCss(): string {
  if (cached !== null) return cached;
  const fonts = JSON.parse(
    readFileSync(join(FONT_DIR, 'fonts.json'), 'utf8'),
  ) as { file: string; style: string; unicodeRange: string }[];
  cached = fonts
    .map((font) => {
      const data = readFileSync(join(FONT_DIR, font.file)).toString('base64');
      return `@font-face{font-family:'Noto Serif';font-style:${font.style};font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${font.unicodeRange};}`;
    })
    .join('\n');
  return cached;
}
