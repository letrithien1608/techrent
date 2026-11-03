import {
  DEPOSIT_REFUND_BUSINESS_DAYS,
  describeRentalPricing,
  formatPercent,
  LOST_DEVICE_MAX_CLAIM_RATIO,
  LOST_SUSPECT_OVERDUE_DAYS,
  REPLACEMENT_VALUE_TOLERANCE,
} from '../../common/business-policy';
import { getStoreInfo } from '../../common/store-info';
import {
  contractNumber,
  type ContractData,
  lateFeeExamples,
  renderContractHtml,
} from './contract-html';
import { formatDateTime, formatMoney } from './contract-format';

const start = new Date('2026-11-05T02:00:00Z'); // 09:00 05/11 giờ VN
const end = new Date('2026-11-07T11:00:00Z'); // 18:00 07/11 giờ VN

function baseData(overrides: Partial<ContractData> = {}): ContractData {
  return {
    bookingId: 'ab12cd34-0000-4000-8000-000000000000',
    issuedAt: start,
    store: getStoreInfo({}),
    staffName: 'Trần Minh Quân',
    customer: {
      name: 'Nguyễn Văn An',
      cccd: '079204001234',
      phone: '0901234567',
      email: 'an@example.com',
    },
    device: {
      name: 'Sony Alpha A7 IV (body)',
      category: 'Máy ảnh',
      brand: 'Sony',
      serialNumber: 'SN-A7IV-0001',
      originalPrice: 58_000_000,
      pricePerDay: 450_000,
      accessories: [
        { name: 'Pin', quantity: 2 },
        { name: 'Sạc pin', quantity: 1 },
      ],
    },
    startTime: start,
    endTime: end,
    pricing: describeRentalPricing(60_000, 450_000, start, end),
    depositAmount: 29_000_000,
    deposit: { txnRef: 'TXN-123', paidAt: start },
    rental: { paid: true, methodLabel: 'Tiền mặt', paidAt: start },
    handover: null,
    returnInfo: null,
    swaps: [],
    ...overrides,
  };
}

const text = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('renderContractHtml (hợp đồng thuê tài sản)', () => {
  it('số hợp đồng, quốc hiệu, căn cứ Bộ luật Dân sự 2015 và Nghị định 13/2023', () => {
    const html = text(renderContractHtml(baseData(), ''));
    expect(contractNumber(baseData().bookingId, start)).toBe(
      '2026/HĐTTS-AB12CD34',
    );
    expect(html).toContain('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM');
    expect(html).toContain('Số: 2026/HĐTTS-AB12CD34');
    expect(html).toContain('Bộ luật Dân sự số 91/2015/QH13');
    expect(html).toContain('Nghị định số 13/2023/NĐ-CP');
  });

  it('tiền có số + chữ, ngày dd/MM/yyyy HH:mm, tổng số giờ/ngày thuê', () => {
    const html = text(renderContractHtml(baseData(), ''));
    expect(formatMoney(1_350_000)).toBe('1.350.000 đ');
    expect(html).toContain(
      '1.350.000 đ (Một triệu ba trăm năm mươi nghìn đồng)',
    );
    expect(html).toContain('29.000.000 đ (Hai mươi chín triệu đồng)');
    expect(html).toContain('58.000.000 đ (Năm mươi tám triệu đồng)');
    expect(html).toContain(formatDateTime(start));
    expect(formatDateTime(start)).toBe('05/11/2026 09:00');
    expect(html).toContain('57 giờ (2 ngày 9 giờ)');
    expect(html).toContain('số ngày tính tiền: 3 ngày');
  });

  it('serial/IMEI, hãng, bảng phụ kiện có cột số lượng và ô đánh dấu', () => {
    const html = renderContractHtml(baseData(), '');
    expect(html).toContain('SN-A7IV-0001');
    expect(text(html)).toContain('Phụ kiện Số lượng Khi giao Khi trả');
    expect(text(html)).toContain('1 Pin 2 ☐ ☐');
  });

  it('bảng ví dụ phí trễ hạn tính cho ĐÚNG thiết bị của hợp đồng', () => {
    expect(lateFeeExamples(450_000, 58_000_000)).toEqual([
      { day: 1, dayFee: 90_000, total: 90_000 },
      { day: 2, dayFee: 180_000, total: 270_000 },
      { day: 3, dayFee: 270_000, total: 540_000 },
    ]);
    const html = text(renderContractHtml(baseData(), ''));
    expect(html).toContain('Trễ 2 ngày 180.000 đ 270.000 đ');
  });

  it('điều khoản lấy đúng hằng số chính sách, tách rõ huỷ trước khi nhận và khi trả máy', () => {
    const html = text(renderContractHtml(baseData(), ''));
    expect(html).toContain(
      `tối đa ${DEPOSIT_REFUND_BUSINESS_DAYS} ngày làm việc`,
    );
    expect(html).toContain(`từ ${LOST_SUSPECT_OVERDUE_DAYS} ngày trở lên`);
    expect(html).toContain(
      `không vượt quá ${formatPercent(LOST_DEVICE_MAX_CLAIM_RATIO)} giá trị tài sản`,
    );
    expect(html).toContain(
      `không quá ${formatPercent(REPLACEMENT_VALUE_TOLERANCE)}`,
    );
    expect(html).toContain('Huỷ đơn trước khi nhận thiết bị');
    expect(html).toContain(
      'Tiền cọc hoàn lại = Tiền cọc − Phí trễ hạn (Điều 7) − Phí hư hỏng/thiếu phụ kiện',
    );
    // Câu cũ gây hiểu nhầm "đã nhận máy là mất cọc" phải không còn.
    expect(html).not.toContain('sau khi đã nhận thiết bị');
    expect(html).toContain('mã giao dịch TXN-123');
  });

  it('chỉ có Phụ lục đổi thiết bị khi đơn có đổi máy', () => {
    expect(renderContractHtml(baseData(), '')).not.toContain(
      'PHỤ LỤC ĐỔI THIẾT BỊ',
    );
    const html = text(
      renderContractHtml(
        baseData({
          swaps: [
            {
              at: start,
              staffName: 'Trần Minh Quân',
              oldDevice: { name: 'Lenovo ThinkPad X1', serialNumber: 'SN-OLD' },
              newDevice: { name: 'Dell XPS 15', serialNumber: 'SN-NEW' },
              reason: 'Máy tự tắt nguồn',
              note: null,
            },
          ],
        }),
        '',
      ),
    );
    expect(html).toContain('PHỤ LỤC ĐỔI THIẾT BỊ');
    expect(html).toContain('Lenovo ThinkPad X1 — Serial/IMEI: SN-OLD');
    expect(html).toContain('Dell XPS 15 — Serial/IMEI: SN-NEW');
    expect(html).toContain('Máy tự tắt nguồn');
  });

  it('phụ lục biên bản giao nhận điền số liệu trả máy (trễ, hư hỏng, hoàn cọc, nợ)', () => {
    const html = text(
      renderContractHtml(
        baseData({
          returnInfo: {
            returnedAt: new Date(end.getTime() + 30 * 3600 * 1000),
            staffName: 'Trần Minh Quân',
            conditionLabel: 'Hư hỏng',
            damageDescription: 'Nứt màn hình LCD',
            notes: null,
            images: [],
            lateFee: 270_000,
            damageFee: 2_500_000,
            repairFee: 0,
            depositRefund: 26_230_000,
            rentalRefund: 0,
            amountOwed: 0,
          },
        }),
        '',
      ),
    );
    expect(html).toContain('BIÊN BẢN GIAO NHẬN THIẾT BỊ');
    expect(html).toContain('Số ngày trễ hạn 2 ngày');
    expect(html).toContain('Hư hỏng — Nứt màn hình LCD');
    expect(html).toContain('26.230.000 đ');
  });

  it('escape dữ liệu động và chuẩn hoá Unicode NFC', () => {
    const nfd = 'Nguyễn Văn An'.normalize('NFD');
    const html = renderContractHtml(
      baseData({
        customer: { ...baseData().customer, name: `${nfd}<script>x</script>` },
      }),
      '',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Nguyễn Văn An'.normalize('NFC'));
    expect(html).not.toContain(nfd);
  });

  it('khổ A4 + lề trái 2,5cm, chữ 13pt, khối chữ ký không ngắt trang', () => {
    const html = renderContractHtml(baseData(), '');
    expect(html).toContain('@page { size: A4; margin: 2cm 2cm 2cm 2.5cm; }');
    expect(html).toContain('font-size: 13pt; line-height: 1.5');
    expect(html).toMatch(/\.signatures \{ break-inside: avoid/);
  });
});
