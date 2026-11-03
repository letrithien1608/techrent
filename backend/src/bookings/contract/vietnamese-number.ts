// Đọc số tiền thành chữ tiếng Việt cho hợp đồng ("Một triệu ba trăm hai mươi
// nghìn đồng"). Hàm thuần, theo cách đọc phổ thông: "mươi/mười", "lăm" sau
// hàng chục, "mốt" sau "mươi", "linh" cho hàng chục bằng 0, nhóm "nghìn/triệu/tỷ".

const DIGITS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
];
const GROUP_UNITS = ['', 'nghìn', 'triệu', 'tỷ'];

/** Đọc 1 nhóm 3 chữ số. `full` = nhóm không đứng đầu (phải đọc đủ "không trăm", "linh"). */
function readGroup(value: number, full: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  const words: string[] = [];

  if (hundreds > 0 || full) {
    words.push(DIGITS[hundreds], 'trăm');
  }
  if (tens === 0) {
    if (ones > 0 && (hundreds > 0 || full)) words.push('linh');
  } else if (tens === 1) {
    words.push('mười');
  } else {
    words.push(DIGITS[tens], 'mươi');
  }
  if (ones > 0) {
    if (ones === 5 && tens > 0) words.push('lăm');
    else if (ones === 1 && tens > 1) words.push('mốt');
    else words.push(DIGITS[ones]);
  }
  return words.join(' ');
}

/** Số nguyên không âm → chữ (không viết hoa, không kèm "đồng"). */
export function numberToVietnameseWords(input: number): string {
  const value = Math.round(Math.abs(input));
  if (value === 0) return 'không';

  // Tách nhóm 3 chữ số từ phải sang; sau "tỷ" lặp lại chu kỳ nghìn/triệu/tỷ.
  const groups: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1000)) {
    groups.push(rest % 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    if (group === 0) {
      // Nhóm "tỷ" rỗng vẫn phải đọc khi còn nhóm cao hơn (VD 1.000.000.000.000).
      if (i > 0 && i % 3 === 0 && i < groups.length - 1) parts.push('tỷ');
      continue;
    }
    const isLeading = i === groups.length - 1;
    const unit = i === 0 ? '' : GROUP_UNITS[((i - 1) % 3) + 1];
    parts.push(readGroup(group, !isLeading), unit);
  }
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** "Một triệu ba trăm hai mươi nghìn đồng" — viết hoa chữ đầu, dùng trong ngoặc sau số tiền. */
export function moneyInWords(value: number): string {
  const words = `${numberToVietnameseWords(value)} đồng`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
