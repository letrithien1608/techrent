import { BadRequestException } from '@nestjs/common';

export const REVIEW_COMMENT_MIN = 10;
export const REVIEW_COMMENT_MAX = 1000;

// Link/tên miền trong nội dung đánh giá thường là quảng cáo/lừa đảo — chặn hẳn.
const LINK_PATTERN =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|vn|io|info|xyz|me|co|biz|top|site|shop|link)\b)/i;
// Cùng 1 ký tự lặp từ 6 lần liên tiếp ("aaaaaa", "!!!!!!", "555555") — spam/gõ bừa.
const REPEATED_CHAR_PATTERN = /(.)\1{5,}/u;

/**
 * Chuẩn hoá + kiểm tra nội dung đánh giá (chặn ở backend, frontend chỉ nhắc trước).
 * Trả về nội dung đã gọn khoảng trắng; ném BadRequestException nếu vi phạm.
 */
export function sanitizeReviewComment(raw: string): string {
  const comment = raw.replace(/\s+/g, ' ').trim();
  if (comment.length < REVIEW_COMMENT_MIN) {
    throw new BadRequestException(
      `Nội dung đánh giá cần ít nhất ${REVIEW_COMMENT_MIN} ký tự`,
    );
  }
  if (comment.length > REVIEW_COMMENT_MAX) {
    throw new BadRequestException(
      `Nội dung đánh giá tối đa ${REVIEW_COMMENT_MAX} ký tự`,
    );
  }
  if (LINK_PATTERN.test(comment)) {
    throw new BadRequestException(
      'Nội dung đánh giá không được chứa đường link hoặc tên miền website',
    );
  }
  if (REPEATED_CHAR_PATTERN.test(comment)) {
    throw new BadRequestException(
      'Nội dung đánh giá có ký tự lặp lại liên tục — vui lòng viết nhận xét rõ ràng hơn',
    );
  }
  return comment;
}

/**
 * Che tên người đánh giá khi hiển thị công khai: giữ họ, các chữ sau chỉ lấy
 * chữ cái đầu — "Nguyễn Văn An" → "Nguyễn V. A", "Bình" → "B.".
 */
export function maskReviewerName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Khách hàng';
  const initial = (word: string) => word.charAt(0).toLocaleUpperCase('vi');
  if (words.length === 1) return `${initial(words[0])}.`;
  return `${words[0]} ${words.slice(1).map(initial).join('. ')}`;
}
