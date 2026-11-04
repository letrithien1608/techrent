// Phí trễ hạn do HỆ THỐNG TỰ TÍNH, Trợ lý AI chỉ diễn đạt lại.
// Model 7B cộng dồn không ổn định (đã thấy thật: "trễ 2 ngày tổng 160.000đ",
// "2 ngày phạt tổng 40%"), nên: trích số ngày trễ + giá thuê/ngày từ câu hỏi
// → tính bằng đúng hàm nghiệp vụ → đưa bảng tính sẵn vào tham khảo → kiểm tra
// lại câu trả lời, sai TỔNG thì thay bằng câu dựng từ bảng.
import {
  calculateLateFeeForDays,
  formatPercent,
  LATE_FEE_DAILY_RATIO,
} from '../common/business-policy';
import { formatVnd } from './knowledge.service';

export const MAX_LATE_DAYS = 30;
const MIN_PRICE_PER_DAY = 10_000;
const MAX_PRICE_PER_DAY = 50_000_000;
/** Bảng dài quá thì chỉ ghi tổng (từng ngày vẫn theo đúng quy tắc leo thang). */
const MAX_LISTED_DAYS = 10;

export interface LateFeeQuery {
  days: number;
  /** null = câu hỏi không nêu giá (có thể lấy từ thiết bị được nhắc tên). */
  pricePerDay: number | null;
  /** Giá trị thiết bị nếu câu hỏi tự nêu ("máy giá trị 30 triệu"). */
  originalPrice: number | null;
  /**
   * Câu hỏi hỏi thêm chuyện khác (cọc, bồi thường, hoàn tiền...) → vẫn đưa
   * bảng tính sẵn nhưng KHÔNG thay câu trả lời (câu dựng sẵn chỉ nói phí trễ).
   */
  mixed: boolean;
}

export interface LateFeeCalculation {
  days: number;
  pricePerDay: number;
  deviceName: string | null;
  /** Mức trần = giá trị thiết bị (chỉ có khi biết thiết bị/giá trị). */
  originalPrice: number | null;
  perDay: { day: number; fee: number; ratio: number }[];
  /** Cộng dồn chưa áp trần. */
  uncappedTotal: number;
  total: number;
  capped: boolean;
  /** true = câu hỏi chỉ về phí trễ → kiểm tra tổng, sai thì thay bằng câu dựng sẵn. */
  verifyAnswer: boolean;
}

/** Chủ đề khác ngoài phí trễ: có thì câu trả lời không chỉ là tổng phí trễ. */
const OTHER_TOPIC_WORDS =
  /\b(coc|hoan|boi thuong|hu hong|khau tru|mat may|mat thiet bi)\b/;

/** Chữ thường, bỏ dấu, đ→d, GIỮ dấu chấm/phẩy/gạch chéo để đọc được số tiền. */
function lite(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

const DAY_WORDS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
};

// KHÔNG dùng "muộn"/"chậm" đứng riêng: "muốn" cũng bỏ dấu thành "muon".
const LATE_WORDS = /\b(tre|qua han|tra muon|tra cham)\b/;

interface Match {
  value: number;
  index: number;
  end: number;
}

/** "2 ngày", "hai ngày", "2 hôm" — bỏ "/1 ngày", "mỗi ngày" (đó là đơn vị giá). */
function dayMatches(text: string): Match[] {
  const pattern = new RegExp(
    `(?<![\\d/.,])\\b(\\d{1,3}|${Object.keys(DAY_WORDS).join('|')})\\s*(ngay|hom)\\b`,
    'g',
  );
  const result: Match[] = [];
  for (const m of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, m.index - 6), m.index);
    if (/(\/|moi|tren|per)\s*$/.test(before)) continue;
    // "400 nghìn một ngày" / "400k 1 ngày" = đơn vị của giá, không phải số ngày trễ.
    const beforeLong = text.slice(Math.max(0, m.index - 12), m.index);
    if (/(\d|k|nghin|ngan|trieu|tr|d|dong|vnd)\s*$/.test(beforeLong)) continue;
    const value = /^\d+$/.test(m[1]) ? Number(m[1]) : DAY_WORDS[m[1]];
    result.push({ value, index: m.index, end: m.index + m[0].length });
  }
  return result;
}

/**
 * Số tiền: "400.000đ", "400,000", "400000", "400k", "400 nghìn", "1,5 triệu",
 * "1.5tr". Số trần không đơn vị chỉ nhận khi ≥ 1.000 (tránh nhầm "2 ngày").
 */
export function moneyMatches(text: string): Match[] {
  const pattern =
    /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d{1,2})?)(?![.,]?\d)\s*(k\b|nghin|ngan|trieu|tr\b|d\b|dong|vnd)?/g;
  const result: Match[] = [];
  for (const m of text.matchAll(pattern)) {
    const [whole, digits, unit] = m;
    const grouped = /^\d{1,3}([.,]\d{3})+$/.test(digits);
    const base = grouped
      ? Number(digits.replace(/[.,]/g, ''))
      : Number(digits.replace(',', '.'));
    let value: number;
    if (unit === 'k' || unit === 'nghin' || unit === 'ngan') value = base * 1e3;
    else if (unit === 'trieu' || unit === 'tr') value = base * 1e6;
    else if (unit || grouped || base >= 1000) value = base;
    else continue;
    if (!Number.isFinite(value) || value <= 0) continue;
    result.push({
      value: Math.round(value),
      index: m.index,
      end: m.index + whole.length,
    });
  }
  return result;
}

function pickDays(text: string): number | null {
  const all = dayMatches(text);
  // Ưu tiên số ngày đứng ngay sau/trước chữ "trễ/quá hạn/muộn".
  const tied = all.filter((m) => {
    const before = text.slice(Math.max(0, m.index - 20), m.index);
    const after = text.slice(m.end, m.end + 12);
    return LATE_WORDS.test(before) || LATE_WORDS.test(after);
  });
  const candidates = tied.length ? tied : all;
  const values = [...new Set(candidates.map((m) => m.value))];
  if (values.length !== 1) return null; // nhiều số ngày khác nhau → không chắc
  const days = values[0];
  return days >= 1 && days <= MAX_LATE_DAYS ? days : null;
}

function pickPricePerDay(text: string, money: Match[]): number | null {
  const perDay = money.filter((m) =>
    /^\s*(\/|mot|moi|1)?\s*(ngay|\/\s*1\s*ngay)/.test(
      text.slice(m.end, m.end + 12),
    ),
  );
  const afterRentWord = money.filter((m) =>
    /gia thue[^.,;]{0,12}$/.test(
      text.slice(Math.max(0, m.index - 20), m.index),
    ),
  );
  const notValueOrDeposit = money.filter(
    (m) =>
      !/(gia tri|tri gia|coc|gia goc|gia may)[^.,;]{0,12}$/.test(
        text.slice(Math.max(0, m.index - 20), m.index),
      ),
  );
  for (const group of [perDay, afterRentWord, notValueOrDeposit]) {
    const values = [...new Set(group.map((m) => m.value))];
    if (values.length === 1) {
      const price = values[0];
      return price >= MIN_PRICE_PER_DAY && price <= MAX_PRICE_PER_DAY
        ? price
        : null;
    }
    if (values.length > 1) return null; // nhiều giá khác nhau → không chắc
  }
  return null;
}

function pickOriginalPrice(text: string, money: Match[]): number | null {
  const values = money
    .filter((m) =>
      /(gia tri|tri gia|gia goc)[^.,;]{0,12}$/.test(
        text.slice(Math.max(0, m.index - 20), m.index),
      ),
    )
    .map((m) => m.value);
  return new Set(values).size === 1 ? values[0] : null;
}

/**
 * Câu hỏi có phải tính phí trễ hạn không, và trích số liệu. Không chắc chắn
 * (thiếu số ngày, nhiều số mâu thuẫn) → null để model trả lời như cũ.
 */
export function extractLateFeeQuery(message: string): LateFeeQuery | null {
  const text = lite(message);
  if (!LATE_WORDS.test(text)) return null;
  const days = pickDays(text);
  if (days === null) return null;
  const money = moneyMatches(text);
  const pricePerDay = pickPricePerDay(text, money);
  const originalPrice = pickOriginalPrice(text, money);
  const otherMoney = money.some(
    (m) => m.value !== pricePerDay && m.value !== originalPrice,
  );
  return {
    days,
    pricePerDay,
    originalPrice,
    mixed: otherMoney || OTHER_TOPIC_WORDS.test(text),
  };
}

/** Tính bằng đúng `calculateLateFeeForDays()` — không có công thức thứ hai. */
export function calculateLateFeeTable(input: {
  days: number;
  pricePerDay: number;
  originalPrice?: number | null;
  deviceName?: string | null;
  verifyAnswer?: boolean;
}): LateFeeCalculation {
  const cap = input.originalPrice ?? null;
  const perDay = Array.from({ length: input.days }, (_, i) => {
    const day = i + 1;
    const cumulative = calculateLateFeeForDays(
      day,
      input.pricePerDay,
      Number.MAX_VALUE,
    );
    const previous = calculateLateFeeForDays(
      day - 1,
      input.pricePerDay,
      Number.MAX_VALUE,
    );
    return {
      day,
      fee: cumulative - previous,
      ratio: LATE_FEE_DAILY_RATIO * day,
    };
  });
  const uncappedTotal = calculateLateFeeForDays(
    input.days,
    input.pricePerDay,
    Number.MAX_VALUE,
  );
  const total = calculateLateFeeForDays(
    input.days,
    input.pricePerDay,
    cap ?? Number.MAX_VALUE,
  );
  return {
    days: input.days,
    pricePerDay: input.pricePerDay,
    deviceName: input.deviceName ?? null,
    originalPrice: cap,
    perDay,
    uncappedTotal,
    total,
    capped: total < uncappedTotal,
    verifyAnswer: input.verifyAnswer ?? true,
  };
}

/** Tổng cộng dồn tính theo % giá thuê 1 ngày (VD trễ 2 ngày = 60%). */
const totalRatio = (calc: LateFeeCalculation) =>
  formatPercent(calc.uncappedTotal / calc.pricePerDay);

function dayLines(calc: LateFeeCalculation, bullet: string): string[] {
  if (calc.days > MAX_LISTED_DAYS) {
    return [
      `${bullet}Ngày trễ 1: ${formatVnd(calc.perDay[0].fee)} (${formatPercent(calc.perDay[0].ratio)} giá thuê/ngày), mỗi ngày sau tăng thêm ${formatPercent(LATE_FEE_DAILY_RATIO)}, tới ngày trễ ${calc.days}: ${formatVnd(calc.perDay[calc.days - 1].fee)} (${formatPercent(calc.perDay[calc.days - 1].ratio)})`,
    ];
  }
  return calc.perDay.map(
    (d) =>
      `${bullet}Ngày trễ ${d.day}: ${formatVnd(d.fee)} (${formatPercent(d.ratio)} giá thuê/ngày)`,
  );
}

function subject(calc: LateFeeCalculation): string {
  const price = `giá thuê ${formatVnd(calc.pricePerDay)}/ngày`;
  return calc.deviceName ? `${calc.deviceName} (${price})` : price;
}

function totalSentence(calc: LateFeeCalculation): string {
  if (calc.capped) {
    return `Cộng dồn ra ${formatVnd(calc.uncappedTotal)} nhưng phí trễ hạn tối đa bằng giá trị thiết bị nên TỔNG PHÍ TRỄ ${calc.days} NGÀY: ${formatVnd(calc.total)}`;
  }
  return `TỔNG PHÍ TRỄ ${calc.days} NGÀY: ${formatVnd(calc.total)} (bằng ${totalRatio(calc)} giá thuê 1 ngày)`;
}

/** Bảng đưa vào <tham_khao>. */
export function formatLateFeeReference(calc: LateFeeCalculation): string {
  const lines = [
    '### KẾT QUẢ TÍNH SẴN (dùng nguyên văn các số này, không tự tính lại)',
    `${subject(calc)}, trả trễ ${calc.days} ngày:`,
    ...dayLines(calc, '- '),
    `${totalSentence(calc)}, trừ vào tiền cọc khi trả máy.`,
  ];
  if (calc.originalPrice !== null) {
    lines.splice(
      2,
      0,
      `(Giá trị thiết bị ${formatVnd(calc.originalPrice)} là mức tối đa của phí trễ hạn.)`,
    );
  }
  return lines.join('\n');
}

/** Câu trả lời dựng sẵn từ bảng — dùng khi model trả lời sai tổng. */
export function lateFeeTemplateReply(calc: LateFeeCalculation): string {
  const intro = `Với ${subject(calc)}, trả máy trễ ${calc.days} ngày thì phí trễ hạn tính leo thang (ngày trễ thứ N phạt ${formatPercent(LATE_FEE_DAILY_RATIO)} × N giá thuê/ngày, cộng dồn):`;
  const total = calc.capped
    ? `Cộng dồn ra ${formatVnd(calc.uncappedTotal)}, nhưng phí trễ hạn tối đa bằng giá trị thiết bị nên **tổng phí trễ hạn là ${formatVnd(calc.total)}**`
    : `**Tổng phí trễ hạn: ${formatVnd(calc.total)}**`;
  return [
    intro,
    ...dayLines(calc, '- '),
    `${total}, được trừ vào tiền cọc khi bạn trả máy.`,
  ].join('\n');
}

export type LateFeeAnswerProblem = 'wrong-total' | 'missing-total';

/**
 * Kiểm tra câu trả lời: sau chữ "tổng" mà là số tiền/phần trăm KHÁC tổng đã
 * tính → sai; không có đúng số tổng ở đâu cả → thiếu. null = hợp lệ.
 */
export function checkLateFeeAnswer(
  answer: string,
  calc: LateFeeCalculation,
): LateFeeAnswerProblem | null {
  const text = lite(answer);
  const correctRatio = Math.round(
    (calc.uncappedTotal / calc.pricePerDay) * 100,
  );
  for (const m of text.matchAll(/\btong\b/g)) {
    const window = text.slice(m.index, m.index + 80).split(/[\n!?]|\.\s/)[0];
    // Bỏ qua "tổng" của khoản khác ("tổng khấu trừ", "tổng tiền hoàn/cọc/thuê").
    if (/(khau tru|hoan|coc|thanh toan|tien thue)/.test(window.slice(0, 30)))
      continue;
    const firstMoney = moneyMatches(window)[0];
    const firstPercent = /(\d+(?:[.,]\d+)?)\s*%/.exec(window);
    if (
      firstMoney &&
      (!firstPercent || firstMoney.index < firstPercent.index) &&
      firstMoney.value !== calc.total &&
      firstMoney.value !== calc.uncappedTotal
    ) {
      return 'wrong-total';
    }
    if (
      firstPercent &&
      (!firstMoney || firstPercent.index < firstMoney.index) &&
      Number(firstPercent[1].replace(',', '.')) !== correctRatio
    ) {
      return 'wrong-total';
    }
  }
  const hasTotal = moneyMatches(text).some((m) => m.value === calc.total);
  return hasTotal ? null : 'missing-total';
}
