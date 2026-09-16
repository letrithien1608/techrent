import * as crypto from 'crypto';

/** VNPay yêu cầu `vnp_CreateDate` dạng yyyyMMddHHmmss theo giờ local server. */
export function formatVnpayDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Build chuỗi ký theo đúng chuẩn VNPay: key sắp xếp alphabet, value encode theo
 * `application/x-www-form-urlencoded` (encodeURIComponent rồi đổi %20 -> "+").
 */
export function buildVnpaySignData(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map(
      (key) => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`,
    )
    .join('&');
}

export function signVnpayParams(
  params: Record<string, string>,
  hashSecret: string,
): { signData: string; secureHash: string } {
  const signData = buildVnpaySignData(params);
  const secureHash = crypto
    .createHmac('sha512', hashSecret)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');
  return { signData, secureHash };
}

/** Verify checksum của callback/IPN VNPay gửi về — bỏ `vnp_SecureHash`(Type) trước khi ký lại. */
export function verifyVnpaySignature(
  query: Record<string, string>,
  hashSecret: string,
): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { vnp_SecureHash, vnp_SecureHashType, ...rest } = query;
  if (!vnp_SecureHash) return false;

  const { secureHash: expected } = signVnpayParams(rest, hashSecret);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(vnp_SecureHash, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
