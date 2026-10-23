/**
 * Sinh docs/image-credits.md từ manifest.json (nguồn + ghi công từng ảnh thiết bị).
 *   npx ts-node --transpile-only scripts/device-images/write-credits.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { readManifest, ROLE_LABEL, ROLE_ORDER } from './manifest-store';

const OUT = join(__dirname, '..', '..', '..', 'docs', 'image-credits.md');

function main() {
  const devices = Object.values(readManifest().devices).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const lines: string[] = [
    '# Nguồn ảnh thiết bị',
    '',
    'Ảnh thiết bị trong TechRent dùng cho mục đích **học tập, phi thương mại** (đồ án sinh viên).',
    'Bản quyền thuộc về chủ sở hữu ghi bên dưới; ảnh Wikimedia Commons dùng theo đúng giấy phép ghi kèm.',
    'Mỗi ảnh đã được mở xem để xác nhận đúng model, sau đó thu nhỏ (cạnh dài ≤ 1600px) và lưu trên Cloudinary.',
    '',
    'File này sinh tự động từ `backend/scripts/device-images/manifest.json` — không sửa tay.',
    '',
  ];
  const short = devices.filter((d) => d.images.length < 5);
  if (short.length) {
    lines.push('## Thiết bị chưa đủ 5 ảnh đúng model', '');
    for (const d of short)
      lines.push(
        `- **${d.name}** — ${d.images.length} ảnh. ${d.note ?? ''}`.trim(),
      );
    lines.push('');
  }
  lines.push('## Chi tiết từng thiết bị', '');
  for (const d of devices) {
    lines.push(`### ${d.name}`, '');
    if (!d.images.length) {
      lines.push('Chưa có ảnh.', '');
      continue;
    }
    const images = [...d.images].sort(
      (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
    );
    images.forEach((image, i) => {
      lines.push(
        `${i + 1}. ${ROLE_LABEL[image.role]} — ${image.credit} — [trang nguồn](${image.page})`,
      );
    });
    lines.push('');
  }
  writeFileSync(OUT, lines.join('\n'), 'utf-8');
  console.log(`Đã ghi ${OUT}`);
}

main();
