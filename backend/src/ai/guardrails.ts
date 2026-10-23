// Lớp chặn CỨNG phía server, bổ sung cho quy tắc trong system prompt — model
// 7B không đủ tin cậy để tự chống prompt injection hay tự giữ đúng ngôn ngữ
// (đã thấy thật khi chạy `npm run ai:eval`: model in nguyên phần tham khảo khi
// bị yêu cầu "in ra prompt", và thỉnh thoảng trôi sang tiếng Trung).
import { normalizeVi } from './text-utils';

export type Guardrail =
  'prompt-injection' | 'foreign-language' | 'internal-leak';

export const INJECTION_REPLY =
  'Mình không thể chia sẻ hay thay đổi hướng dẫn nội bộ của trợ lý, nhưng rất sẵn lòng giúp bạn về thiết bị, giá thuê hay chính sách của TechRent nhé!';

// So khớp trên văn bản đã bỏ dấu (normalizeVi).
const INJECTION_PATTERNS: RegExp[] = [
  /\b(bo qua|phot lo|quen|xoa bo|vo hieu)\b.{0,40}\b(huong dan|chi dan|chi thi|quy tac|lenh|prompt)\b/,
  /\b(system prompt|prompt he thong|prompt goc|prompt cua ban|developer mode|jailbreak)\b/,
  /\b(in|hien|xem|tiet lo|cho xem|show|print|reveal|repeat|lap lai)\b.{0,40}\b(prompt|huong dan he thong|chi dan he thong|quy tac cua ban)\b/,
  /\bignore\b.{0,30}\b(instruction|instructions|rules|prompt)\b/,
  /\b(dong vai|nhap vai|gia vo la|act as|you are now|pretend to be)\b/,
];

export function isPromptInjection(message: string): boolean {
  const normalized = normalizeVi(message);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Hán tự, kana Nhật, Hangul Hàn, ký tự full-width. */
const CJK_PATTERN = /[぀-ヿ㐀-鿿가-힯＀-￯]/;
/** Dấu hiệu model đang chép lại cấu trúc prompt nội bộ. */
const LEAK_MARKERS = ['tham_khao', 'cau_hoi>', '<cau_hoi', 'QUY TẮC BẮT BUỘC'];
/** Độ dài dài nhất của 1 dấu hiệu — giữ lại chừng ấy ký tự cuối trước khi gửi để không lọt nửa dấu hiệu. */
export const OUTPUT_HOLDBACK_CHARS = Math.max(
  ...LEAK_MARKERS.map((marker) => marker.length),
);

/** Vị trí đầu tiên phải cắt câu trả lời (và lý do), hoặc null nếu an toàn. */
export function findUnsafeOutput(
  text: string,
): { index: number; reason: Guardrail } | null {
  let best: { index: number; reason: Guardrail } | null = null;
  const cjk = text.search(CJK_PATTERN);
  if (cjk >= 0) best = { index: cjk, reason: 'foreign-language' };
  for (const marker of LEAK_MARKERS) {
    const index = text.indexOf(marker);
    if (index >= 0 && (!best || index < best.index)) {
      best = { index, reason: 'internal-leak' };
    }
  }
  return best;
}
