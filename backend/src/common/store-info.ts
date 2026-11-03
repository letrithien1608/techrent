// Thông tin Bên A (cửa hàng) in trên hợp đồng thuê. Ghi đè bằng biến môi trường
// STORE_* khi triển khai thật — giá trị mặc định dưới đây là DỮ LIỆU MẪU của
// đồ án, cần thay bằng thông tin pháp lý thật của cửa hàng.
export interface StoreInfo {
  name: string;
  legalName: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  representative: string;
  representativeTitle: string;
  taxCode: string;
}

export function getStoreInfo(env: NodeJS.ProcessEnv = process.env): StoreInfo {
  return {
    name: env.STORE_NAME ?? 'TechRent',
    legalName:
      env.STORE_LEGAL_NAME ?? 'Cửa hàng cho thuê thiết bị điện tử TechRent',
    address:
      env.STORE_ADDRESS ??
      '123 Đường Công Nghệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    city: env.STORE_CITY ?? 'TP. Hồ Chí Minh',
    phone: env.STORE_PHONE ?? '0909 000 123',
    email: env.STORE_EMAIL ?? 'hotro@techrent.vn',
    representative: env.STORE_REPRESENTATIVE ?? 'Lê Trí Thiện',
    representativeTitle: env.STORE_REPRESENTATIVE_TITLE ?? 'Chủ cửa hàng',
    taxCode: env.STORE_TAX_CODE ?? '',
  };
}
