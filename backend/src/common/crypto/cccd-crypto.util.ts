import * as crypto from 'crypto';

const HASH_ALGORITHM = 'sha256';
const CIPHER_ALGORITHM = 'aes-256-gcm';
// Khuyến nghị chuẩn cho GCM (12 byte) — KHÔNG đổi trừ khi có lý do mật mã học rõ ràng.
const IV_LENGTH_BYTES = 12;

/**
 * Hash 1 CHIỀU (SHA-256) — dùng để kiểm tra trùng CCCD qua unique index cấp
 * database MÀ KHÔNG cần giải mã lại (không đảo ngược được về số CCCD gốc).
 * Đây là giá trị lưu ở cột `cccd_hash`, KHÔNG PHẢI cột `cccd_encrypted`.
 */
export function hashCccd(cccd: string): string {
  return crypto.createHash(HASH_ALGORITHM).update(cccd.trim()).digest('hex');
}

/**
 * Mã hoá 2 CHIỀU (AES-256-GCM) — dùng để LƯU giá trị CCCD gốc, phục vụ admin
 * xem lại khi cần xác minh tranh chấp thật (xem `decryptCccd`). `keyHex` PHẢI
 * là chuỗi hex 64 ký tự (đúng 32 byte cho AES-256) — đọc từ biến môi trường
 * `CCCD_ENCRYPTION_KEY`, sinh bằng `crypto.randomBytes(32).toString('hex')`.
 *
 * Output tự chứa IV + authTag + ciphertext (nối bằng ":", đều hex) — không cần
 * lưu IV/authTag ở cột riêng, decrypt lại chỉ cần đúng `keyHex` gốc.
 */
export function encryptCccd(cccd: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(cccd.trim(), 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Giải mã CCCD từ `encryptCccd()` — CHỈ dùng ở đúng 1 endpoint riêng cho admin
 * xem đầy đủ khi cần xác minh (`GET /users/:id/cccd`). KHÔNG BAO GIỜ gọi hàm
 * này để trả CCCD trong bất kỳ response API thông thường nào khác — dùng
 * `maskCccd()`/cột `cccd_masked` đã có sẵn cho mọi nơi hiển thị.
 */
export function decryptCccd(encrypted: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Định dạng CCCD đã mã hoá không hợp lệ');
  }
  const decipher = crypto.createDecipheriv(
    CIPHER_ALGORITHM,
    key,
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf-8');
}

/**
 * Che bớt CCCD khi hiển thị ra client — CHỈ hiện 4 số cuối (VD "********1234").
 * Dùng cho MỌI nơi hiển thị, kể cả admin xem danh sách user — CCCD đầy đủ
 * không bao giờ nên xuất hiện ngoài đúng 1 endpoint reveal dành cho admin.
 */
export function maskCccd(cccd: string): string {
  const trimmed = cccd.trim();
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  return '*'.repeat(trimmed.length - 4) + trimmed.slice(-4);
}
