/**
 * Sinh docs/device-sources.md từ prisma/seed-data/device-specs.json — danh sách
 * nguồn đã dùng để tra thông số từng thiết bị. Chạy lại sau khi sửa file JSON:
 *   npx ts-node --transpile-only scripts/catalog/write-device-sources.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface ResearchedDevice {
  previousNames?: string[];
  sources: string[];
  specs: Record<string, string>;
}

const root = join(__dirname, '..', '..');
const devices = JSON.parse(
  readFileSync(join(root, 'prisma', 'seed-data', 'device-specs.json'), 'utf-8'),
) as Record<string, ResearchedDevice>;

const lines = [
  '# Nguồn thông số kỹ thuật thiết bị',
  '',
  'Thông số trong bảng "Thông số kỹ thuật" của từng thiết bị được tra từ trang hãng và trang review/bán lẻ uy tín, đối chiếu ít nhất 2 nguồn cho thông số chính. Thông số các nguồn mâu thuẫn hoặc không xác minh được thì để trống, không điền đoán.',
  '',
  'File này sinh tự động từ `backend/prisma/seed-data/device-specs.json` bằng `backend/scripts/catalog/write-device-sources.ts` — sửa ở file JSON rồi chạy lại script, không sửa tay file này.',
  '',
];

for (const [name, device] of Object.entries(devices)) {
  lines.push(`## ${name}`, '');
  if (device.previousNames?.length) {
    lines.push(
      `Tên cũ: ${device.previousNames.join(', ')} (đổi tên cho đúng cấu hình đã tra).`,
      '',
    );
  }
  lines.push(`Số thông số: ${Object.keys(device.specs).length}`, '');
  for (const url of device.sources) lines.push(`- ${url}`);
  lines.push('');
}

const out = join(root, '..', 'docs', 'device-sources.md');
writeFileSync(out, lines.join('\n'), 'utf-8');
console.log(`Đã ghi ${Object.keys(devices).length} thiết bị vào ${out}`);
