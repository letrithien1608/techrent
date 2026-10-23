// Chuẩn hoá tiếng Việt để so khớp từ khoá: chữ thường, bỏ dấu, gộp khoảng
// trắng. "Đặt cọc" → "dat coc". Không cần thư viện NLP — đủ cho RAG từ khoá.

export function normalizeVi(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Âm tiết quá phổ biến, khớp được gần như mọi đoạn → không mang thông tin.
const STOPWORDS = new Set(
  (
    'la va cua co khong thi bi duoc cho toi minh ban em anh chi nao gi the ' +
    'nhu nay do mot cac nhung voi trong khi neu de ra vao len xuong lam ' +
    'hay hoac ma con roi se da dang can phai muon biet hoi oi a nhe vay ' +
    'sao bao nhieu techrent'
  ).split(' '),
);

export function tokenize(normalized: string): string[] {
  return normalized
    .split(' ')
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

/** Cặp từ liền nhau ("tien coc", "tre han") — chính xác hơn hẳn từng âm tiết rời. */
export function bigrams(tokens: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return result;
}

/**
 * Nhóm từ đồng nghĩa (đã chuẩn hoá không dấu). Câu hỏi chứa 1 cụm trong nhóm
 * thì mọi cụm khác trong nhóm cũng được tính là từ khoá tìm kiếm.
 */
export const SYNONYM_GROUPS: string[][] = [
  ['coc', 'dat coc', 'tien coc', 'ky quy', 'tien dat'],
  ['hoan coc', 'hoan tien', 'tra lai tien', 'lay lai tien', 'hoan lai'],
  [
    'tre',
    'tre han',
    'qua han',
    'tra muon',
    'den muon',
    'tra cham',
    'phi tre',
    'phat',
  ],
  ['huy', 'huy don', 'khong thue nua', 'doi y'],
  [
    'hong',
    'loi',
    'khong len',
    'khong dung duoc',
    'khong hoat dong',
    'su co',
    'truc trac',
    'bao hong',
    'khong chay',
  ],
  [
    'giay to',
    'cccd',
    'can cuoc',
    'cmnd',
    'xac thuc',
    'danh tinh',
    'selfie',
    'chan dung',
    'kyc',
  ],
  ['thanh toan', 'vnpay', 'chuyen khoan', 'tra tien', 'the ngan hang'],
  ['hop dong', 'ky ten', 'ky hop dong'],
  [
    'danh mat',
    'bi mat',
    'mat may',
    'mat thiet bi',
    'chiem giu',
    'khong tra',
    'danh sach den',
    'boi thuong',
  ],
  [
    'giu cho',
    'chua thanh toan',
    'tu huy',
    'het han thanh toan',
    'cho thanh toan',
  ],
  ['dang ky', 'tao tai khoan', 'mo tai khoan'],
  ['quy trinh', 'cac buoc', 'thu tuc', 'cach thue', 'thue nhu the nao'],
  ['nhan may', 'nhan thiet bi', 'giao may', 'lay may'],
  ['tra may', 'tra thiet bi', 'gui lai'],
  ['gia', 'gia thue', 'chi phi', 'bao nhieu tien', 'tinh tien'],
  ['giam gia', 'khuyen mai', 'uu dai', 'voucher', 'ma giam'],
  ['danh gia', 'review', 'nhan xet'],
  ['quen mat khau', 'mat khau', 'dat lai mat khau'],
  ['ket noi', 'cai dat', 'su dung', 'huong dan'],
  ['bao quan', 'luu y'],
];

/** Từ khoá cho thấy người dùng đang hỏi về thiết bị cụ thể / nhu cầu thuê. */
export const DEVICE_INTENT_PHRASES = [
  'goi y',
  'tu van',
  'nen thue',
  'nen chon',
  'phu hop',
  'gia thue',
  'bao nhieu tien',
  'gia',
  'con trong',
  'con hang',
  'co san',
  'thue',
  'may nao',
  'loai nao',
  'thiet bi nao',
];

/** Nhu cầu → tên danh mục (chuẩn hoá) để gợi ý thiết bị phù hợp. */
export const NEED_TO_CATEGORY: Record<string, string[]> = {
  'do hoa': ['laptop', 'may tinh bang'],
  'dung phim': ['laptop'],
  'edit video': ['laptop'],
  'lap trinh': ['laptop'],
  'van phong': ['laptop'],
  'choi game': [
    'may choi game',
    'may choi game cam tay',
    'phu kien gaming',
    'laptop',
  ],
  gaming: ['may choi game', 'may choi game cam tay', 'phu kien gaming'],
  'cam tay': ['may choi game cam tay', 'gimbal chong rung'],
  'steam deck': ['may choi game cam tay'],
  'di du lich': ['may choi game cam tay', 'camera hanh dong'],
  gimbal: ['gimbal chong rung'],
  'chong rung': ['gimbal chong rung'],
  'quay vlog': ['gimbal chong rung', 'camera hanh dong'],
  'chup anh': ['may anh', 'camera hanh dong'],
  'quay phim': ['may anh', 'gimbal chong rung', 'flycam', 'camera hanh dong'],
  'quay video': ['may anh', 'camera hanh dong'],
  vlog: ['camera hanh dong', 'may anh'],
  'du lich': ['camera hanh dong', 'flycam'],
  drone: ['flycam'],
  'tren cao': ['flycam'],
  'thuyet trinh': ['may chieu', 'man hinh di dong'],
  'hoi nghi': ['may chieu', 'thiet bi am thanh'],
  'xem phim': ['may chieu'],
  'su kien': ['thiet bi am thanh', 'may chieu'],
  tiec: ['thiet bi am thanh', 'may choi game'],
  loa: ['thiet bi am thanh'],
  wifi: ['thiet bi mang'],
  router: ['thiet bi mang'],
  vr: ['kinh thuc te ao'],
  livestream: ['thiet bi livestream', 'thiet bi thu am'],
  stream: ['thiet bi livestream'],
  webcam: ['thiet bi livestream'],
  podcast: ['thiet bi thu am'],
  'thu am': ['thiet bi thu am'],
  micro: ['thiet bi thu am'],
  chuot: ['phu kien gaming'],
  'ban phim': ['phu kien gaming'],
  'tai nghe': ['phu kien gaming'],
  tablet: ['may tinh bang'],
  ipad: ['may tinh bang'],
  've tranh': ['may tinh bang'],
  'man hinh': ['man hinh di dong'],
};

/** Ước lượng số token cho tiếng Việt (Qwen ~2.5 ký tự/token) — dùng để giữ ngân sách ngữ cảnh. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5);
}
