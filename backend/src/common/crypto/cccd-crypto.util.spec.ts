import { decryptCccd, encryptCccd, hashCccd, maskCccd } from './cccd-crypto.util';

describe('cccd-crypto.util', () => {
  // 32 byte (64 ký tự hex) — đúng chuẩn AES-256, sinh giống cách thật ở .env.
  const encryptionKey =
    '5087b9960945283af522f534d221642dd7aac08c5f53f57bded1453b90a1f480';
  const cccd = '079203012345';

  describe('hashCccd', () => {
    it('trả về hash SHA-256 dạng hex, KHÔNG PHẢI CCCD gốc', () => {
      const hash = hashCccd(cccd);
      expect(hash).not.toBe(cccd);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('cùng 1 CCCD luôn cho ra cùng 1 hash (dùng để kiểm tra trùng lặp)', () => {
      expect(hashCccd(cccd)).toBe(hashCccd(cccd));
    });

    it('2 CCCD khác nhau cho ra hash khác nhau', () => {
      expect(hashCccd(cccd)).not.toBe(hashCccd('079203099999'));
    });
  });

  describe('encryptCccd / decryptCccd', () => {
    it('giải mã lại đúng CCCD gốc', () => {
      const encrypted = encryptCccd(cccd, encryptionKey);
      expect(decryptCccd(encrypted, encryptionKey)).toBe(cccd);
    });

    it('ciphertext KHÔNG chứa CCCD gốc dạng thô', () => {
      const encrypted = encryptCccd(cccd, encryptionKey);
      expect(encrypted).not.toContain(cccd);
    });

    it('mỗi lần mã hoá cho ra ciphertext KHÁC NHAU (IV ngẫu nhiên mỗi lần)', () => {
      const first = encryptCccd(cccd, encryptionKey);
      const second = encryptCccd(cccd, encryptionKey);
      expect(first).not.toBe(second);
      // Nhưng vẫn giải mã ra đúng cùng 1 giá trị gốc.
      expect(decryptCccd(first, encryptionKey)).toBe(cccd);
      expect(decryptCccd(second, encryptionKey)).toBe(cccd);
    });

    it('giải mã bằng SAI key sẽ ném lỗi (authTag không khớp) — không âm thầm trả rác', () => {
      const encrypted = encryptCccd(cccd, encryptionKey);
      const wrongKey =
        '0000000000000000000000000000000000000000000000000000000000000000'.slice(
          0,
          64,
        );
      expect(() => decryptCccd(encrypted, wrongKey)).toThrow();
    });
  });

  describe('maskCccd', () => {
    it('chỉ hiện đúng 4 số cuối, che hết phần còn lại', () => {
      expect(maskCccd('079203012345')).toBe('********2345');
    });

    it('không bao giờ chứa toàn bộ CCCD gốc trong kết quả', () => {
      expect(maskCccd(cccd)).not.toBe(cccd);
      expect(maskCccd(cccd).slice(0, -4)).not.toContain(cccd.slice(0, 4));
    });
  });
});
