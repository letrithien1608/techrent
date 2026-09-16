import {
  buildVnpaySignData,
  formatVnpayDate,
  signVnpayParams,
  verifyVnpaySignature,
} from './vnpay.util';

describe('vnpay.util', () => {
  const hashSecret = 'test-hash-secret';

  describe('formatVnpayDate', () => {
    it('trả về đúng định dạng yyyyMMddHHmmss', () => {
      const date = new Date(2026, 8, 16, 9, 5, 3); // 2026-09-16 09:05:03
      expect(formatVnpayDate(date)).toBe('20260916090503');
    });
  });

  describe('buildVnpaySignData', () => {
    it('sắp xếp key theo alphabet và encode space thành +', () => {
      const signData = buildVnpaySignData({
        vnp_TxnRef: 'abc 123',
        vnp_Amount: '1000',
      });
      expect(signData).toBe('vnp_Amount=1000&vnp_TxnRef=abc+123');
    });
  });

  describe('signVnpayParams / verifyVnpaySignature', () => {
    const params = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: 'PH6FRERN',
      vnp_Amount: '1000000',
      vnp_TxnRef: 'booking-1-123456',
    };

    it('verify thành công với đúng chữ ký vừa ký', () => {
      const { secureHash } = signVnpayParams(params, hashSecret);
      const query = { ...params, vnp_SecureHash: secureHash };
      expect(verifyVnpaySignature(query, hashSecret)).toBe(true);
    });

    it('verify thất bại nếu dữ liệu bị sửa sau khi ký (VD đổi số tiền)', () => {
      const { secureHash } = signVnpayParams(params, hashSecret);
      const tampered = {
        ...params,
        vnp_Amount: '9999999',
        vnp_SecureHash: secureHash,
      };
      expect(verifyVnpaySignature(tampered, hashSecret)).toBe(false);
    });

    it('verify thất bại nếu dùng sai hash secret', () => {
      const { secureHash } = signVnpayParams(params, hashSecret);
      const query = { ...params, vnp_SecureHash: secureHash };
      expect(verifyVnpaySignature(query, 'wrong-secret')).toBe(false);
    });

    it('verify thất bại nếu thiếu vnp_SecureHash', () => {
      expect(verifyVnpaySignature({ ...params }, hashSecret)).toBe(false);
    });

    it('bỏ qua vnp_SecureHashType khi tính lại chữ ký', () => {
      const { secureHash } = signVnpayParams(params, hashSecret);
      const query = {
        ...params,
        vnp_SecureHashType: 'SHA512',
        vnp_SecureHash: secureHash,
      };
      expect(verifyVnpaySignature(query, hashSecret)).toBe(true);
    });
  });
});
