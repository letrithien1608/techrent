// Hợp đồng thuê tài sản dạng HTML hoàn chỉnh (hàm thuần, không NestJS DI).
// Một nguồn duy nhất cho: bản xem trong trang admin (iframe), bản in trình duyệt
// và PDF sinh phía server. Mọi con số chính sách lấy từ business-policy.ts; mọi
// số liệu đơn lấy từ ContractData. Chuỗi động đều qua esc() (escape + NFC).
import {
  calculateLateFeeForDays,
  DAY_MS,
  DEPOSIT_RATIO,
  DEPOSIT_REFUND_BUSINESS_DAYS,
  formatPercent,
  HANDOVER_MIN_PHOTOS,
  LATE_FEE_DAILY_RATIO,
  LOST_DEVICE_MAX_CLAIM_RATIO,
  LOST_SUSPECT_OVERDUE_DAYS,
  REFUND_TIERS,
  REPLACEMENT_VALUE_TOLERANCE,
  type RentalPricing,
} from '../../common/business-policy';
import type { StoreInfo } from '../../common/store-info';
import {
  dateParts,
  esc,
  formatDateTime,
  formatMoney,
  thumbnail,
} from './contract-format';
import { moneyInWords } from './vietnamese-number';

export interface ContractAccessory {
  name: string;
  quantity: number;
}

export interface ContractInspection {
  at: Date;
  staffName: string | null;
  notes: string | null;
  images: string[];
}

export interface ContractReturnInfo {
  returnedAt: Date;
  staffName: string | null;
  conditionLabel: string;
  damageDescription: string | null;
  notes: string | null;
  images: string[];
  lateFee: number;
  damageFee: number;
  repairFee: number;
  depositRefund: number;
  rentalRefund: number;
  amountOwed: number;
}

export interface ContractSwap {
  at: Date;
  staffName: string | null;
  oldDevice: { name: string; serialNumber: string | null };
  newDevice: { name: string; serialNumber: string | null };
  reason: string;
  note: string | null;
}

export interface ContractData {
  bookingId: string;
  /** Ngày lập hợp đồng (ngày giao máy nếu đã có biên bản, nếu không là ngày in). */
  issuedAt: Date;
  store: StoreInfo;
  /** Nhân viên lập hợp đồng. */
  staffName: string | null;
  customer: {
    name: string;
    /** Đầy đủ khi in (staff/admin), che khi lưu DB. */
    cccd: string;
    phone: string | null;
    email: string;
  };
  device: {
    name: string;
    category: string;
    brand: string | null;
    serialNumber: string | null;
    originalPrice: number;
    pricePerDay: number;
    accessories: ContractAccessory[];
  };
  startTime: Date;
  endTime: Date;
  pricing: RentalPricing;
  depositAmount: number;
  deposit: { txnRef: string | null; paidAt: Date | null };
  rental: {
    paid: boolean;
    methodLabel: string | null;
    paidAt: Date | null;
  };
  handover: ContractInspection | null;
  returnInfo: ContractReturnInfo | null;
  swaps: ContractSwap[];
}

const DOTS = '……………………………………';
const LONG_DOTS = '………………………………………………………………………';

/** "AB12CD34" → "2026/HĐTTS-AB12CD34". */
export function contractNumber(bookingId: string, issuedAt: Date): string {
  return `${dateParts(issuedAt).year}/HĐTTS-${bookingId.slice(0, 8).toUpperCase()}`;
}

function money(value: number): string {
  return `<strong>${esc(formatMoney(value))}</strong> <em>(${esc(moneyInWords(value))})</em>`;
}

function row(label: string, value: string): string {
  return `<tr><th scope="row">${esc(label)}</th><td>${value}</td></tr>`;
}

function clause(title: string, body: string): string {
  return `<section class="clause"><h2>${esc(title)}</h2>${body}</section>`;
}

/** Bảng ví dụ phí trễ hạn tính sẵn cho ĐÚNG thiết bị của hợp đồng. */
export function lateFeeExamples(
  pricePerDay: number,
  originalPrice: number,
  days = 3,
): { day: number; dayFee: number; total: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    return {
      day,
      dayFee: pricePerDay * LATE_FEE_DAILY_RATIO * day,
      total: calculateLateFeeForDays(day, pricePerDay, originalPrice),
    };
  });
}

function accessoriesTable(accessories: ContractAccessory[]): string {
  const rows = accessories.length
    ? accessories.map(
        (a, i) =>
          `<tr><td class="c">${i + 1}</td><td>${esc(a.name)}</td><td class="c">${a.quantity}</td><td class="c">☐</td><td class="c">☐</td></tr>`,
      )
    : [1, 2, 3].map(
        (i) =>
          `<tr><td class="c">${i}</td><td>${DOTS}</td><td class="c"></td><td class="c">☐</td><td class="c">☐</td></tr>`,
      );
  return `<table class="grid">
  <thead><tr><th>STT</th><th>Phụ kiện</th><th>Số lượng</th><th>Khi giao</th><th>Khi trả</th></tr></thead>
  <tbody>${rows.join('')}</tbody>
</table>`;
}

function photos(images: string[], alt: string): string {
  if (!images.length) return '';
  return `<div class="photos">${images
    .slice(0, 6)
    .map(
      (src, i) =>
        `<img src="${esc(thumbnail(src))}" alt="${esc(`${alt} ${i + 1}`)}">`,
    )
    .join('')}</div>`;
}

function signatures(
  leftTitle: string,
  rightTitle: string,
  leftName: string,
  rightName: string,
  city: string,
): string {
  return `<div class="signatures">
  <p class="sign-date">${esc(city)}, ngày ……… tháng ……… năm …………</p>
  <div class="sign-cols">
    <div><p class="sign-title">${esc(leftTitle)}</p><p class="sign-hint">(Ký, ghi rõ họ tên)</p><p class="sign-name">${esc(leftName)}</p></div>
    <div><p class="sign-title">${esc(rightTitle)}</p><p class="sign-hint">(Ký, ghi rõ họ tên)</p><p class="sign-name">${esc(rightName)}</p></div>
  </div>
</div>`;
}

function handoverAnnex(data: ContractData): string {
  const h = data.handover;
  const r = data.returnInfo;
  const lateDays = r
    ? Math.max(
        Math.ceil((r.returnedAt.getTime() - data.endTime.getTime()) / DAY_MS),
        0,
      )
    : null;
  const handoverPart = `<h3>I. Bàn giao thiết bị cho Bên B</h3>
<table class="kv">
  ${row('Thời điểm giao', h ? esc(formatDateTime(h.at)) : DOTS)}
  ${row('Nhân viên giao', h?.staffName ? esc(h.staffName) : DOTS)}
  ${row('Thiết bị', `${esc(data.device.name)} — Serial/IMEI: ${esc(data.device.serialNumber ?? DOTS)}`)}
  ${row('Tình trạng khi giao', h?.notes ? esc(h.notes) : LONG_DOTS)}
  ${row('Ảnh tình trạng', h ? `${h.images.length} ảnh (tối thiểu ${HANDOVER_MIN_PHOTOS} ảnh) lưu trên hệ thống` : DOTS)}
</table>
${h ? photos(h.images, 'Ảnh khi giao') : ''}
<p>Phụ kiện bàn giao: đánh dấu cột “Khi giao” tại bảng phụ kiện ở Điều 1.</p>
${signatures('BÊN GIAO (BÊN A)', 'BÊN NHẬN (BÊN B)', h?.staffName ?? data.staffName ?? '', data.customer.name, data.store.city)}`;

  const returnPart = `<h3>II. Bên B trả lại thiết bị</h3>
<table class="kv">
  ${row('Thời điểm trả', r ? esc(formatDateTime(r.returnedAt)) : DOTS)}
  ${row('Nhân viên nhận', r?.staffName ? esc(r.staffName) : DOTS)}
  ${row('Tình trạng khi trả', r ? esc(r.conditionLabel) + (r.damageDescription ? ` — ${esc(r.damageDescription)}` : '') : LONG_DOTS)}
  ${row('Ghi chú', r?.notes ? esc(r.notes) : r ? '—' : LONG_DOTS)}
  ${row('Số ngày trễ hạn', r ? `${lateDays} ngày` : DOTS)}
  ${row('Phí trễ hạn', r ? money(r.lateFee) : DOTS)}
  ${row('Phí hư hỏng / thiếu phụ kiện', r ? money(r.damageFee) : DOTS)}
  ${r && r.repairFee > 0 ? row('Chi phí sửa (lỗi do Bên B, đã ghi khi báo lỗi)', money(r.repairFee)) : ''}
  ${row('Tiền cọc hoàn lại', r ? money(r.depositRefund) : DOTS)}
  ${r && r.rentalRefund > 0 ? row('Tiền thuê hoàn lại (kết thúc sớm)', money(r.rentalRefund)) : ''}
  ${row('Khoản Bên B còn nợ', r ? (r.amountOwed > 0 ? money(r.amountOwed) : 'Không') : DOTS)}
</table>
${r ? photos(r.images, 'Ảnh khi trả') : ''}
${signatures('BÊN NHẬN (BÊN A)', 'BÊN TRẢ (BÊN B)', r?.staffName ?? '', data.customer.name, data.store.city)}`;

  return `<section class="annex">
<p class="annex-label">PHỤ LỤC 01</p>
<h1>BIÊN BẢN GIAO NHẬN THIẾT BỊ</h1>
<p class="center">Kèm theo Hợp đồng số ${esc(contractNumber(data.bookingId, data.issuedAt))}</p>
<div class="keep">${handoverPart}</div>
<div class="keep">${returnPart}</div>
</section>`;
}

function swapAnnex(data: ContractData): string {
  if (!data.swaps.length) return '';
  const items = data.swaps
    .map(
      (s, i) => `<div class="keep">
<h3>Lần đổi ${i + 1} — ${esc(formatDateTime(s.at))}</h3>
<table class="kv">
  ${row('Thiết bị cũ', `${esc(s.oldDevice.name)} — Serial/IMEI: ${esc(s.oldDevice.serialNumber ?? '—')}`)}
  ${row('Thiết bị thay thế', `${esc(s.newDevice.name)} — Serial/IMEI: ${esc(s.newDevice.serialNumber ?? '—')}`)}
  ${row('Lý do', `Thiết bị gặp lỗi do thiết bị: ${esc(s.reason)}`)}
  ${s.note ? row('Ghi chú', esc(s.note)) : ''}
  ${row('Nhân viên xử lý', esc(s.staffName ?? DOTS))}
</table>
</div>`,
    )
    .join('');
  return `<section class="annex">
<p class="annex-label">PHỤ LỤC 02</p>
<h1>PHỤ LỤC ĐỔI THIẾT BỊ</h1>
<p class="center">Kèm theo Hợp đồng số ${esc(contractNumber(data.bookingId, data.issuedAt))}</p>
<p>Theo Điều 6 của Hợp đồng, Bên A đã đổi thiết bị cho Bên B như sau. Thời hạn thuê, giá thuê và tiền cọc giữ nguyên; tình trạng thiết bị thay thế ghi nhận tại Biên bản giao nhận (Phụ lục 01).</p>
${items}
${signatures('ĐẠI DIỆN BÊN A', 'BÊN B', data.staffName ?? '', data.customer.name, data.store.city)}
</section>`;
}

const STYLES = `
@page { size: A4; margin: 2cm 2cm 2cm 2.5cm; }
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #e5e7eb; color: #000;
  font-family: 'Noto Serif', 'Times New Roman', serif; font-size: 13pt; line-height: 1.5; }
.page { width: 210mm; max-width: 100%; margin: 24px auto; background: #fff; padding: 2cm 2cm 2cm 2.5cm;
  box-shadow: 0 2px 12px rgba(0,0,0,.15); }
p, td, th, li { text-align: justify; overflow-wrap: anywhere; }
p { margin: 0 0 6pt; }
h1 { font-size: 15pt; text-align: center; margin: 10pt 0 2pt; letter-spacing: .3pt; }
h2 { font-size: 13pt; margin: 12pt 0 4pt; break-after: avoid; page-break-after: avoid; }
h3 { font-size: 13pt; margin: 10pt 0 4pt; break-after: avoid; }
.center { text-align: center; }
.national { text-align: center; font-weight: 700; margin: 0; }
.motto { text-align: center; font-weight: 700; margin: 0; }
.motto-line { text-align: center; margin: 0 0 6pt; letter-spacing: 2pt; }
.subtitle { text-align: center; font-style: italic; margin: 0; }
.bases p { font-style: italic; margin: 0 0 2pt; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; font-size: 12pt; }
table.kv th { width: 34%; text-align: left; font-weight: 400; vertical-align: top; padding: 2pt 8pt 2pt 0; }
table.kv td { padding: 2pt 0; vertical-align: top; }
table.grid th, table.grid td { border: 0.75pt solid #000; padding: 3pt 6pt; vertical-align: top; }
table.grid th { font-weight: 700; text-align: center; }
td.c { text-align: center; }
ol, ul { margin: 0 0 6pt; padding-left: 20pt; }
li { margin: 0 0 3pt; }
.clause, .keep, tr, .photos { break-inside: avoid; page-break-inside: avoid; }
/* Điều khoản cuối + chữ ký đi cùng nhau — không có trang chỉ chứa chữ ký. */
.closing { break-inside: avoid; page-break-inside: avoid; }
.signatures { break-inside: avoid; page-break-inside: avoid; margin-top: 14pt; }
.sign-date { text-align: right; font-style: italic; }
.sign-cols { display: flex; gap: 16pt; }
.sign-cols > div { flex: 1; text-align: center; }
.sign-title { font-weight: 700; text-align: center; margin: 0; }
.sign-hint { font-style: italic; text-align: center; margin: 0 0 64pt; }
.sign-name { font-weight: 700; text-align: center; }
.annex { break-before: page; page-break-before: always; }
.annex-label { text-align: right; font-weight: 700; margin: 0; }
.photos { display: flex; flex-wrap: wrap; gap: 6pt; margin: 4pt 0 8pt; }
.photos img { width: 4cm; height: 3cm; object-fit: cover; border: 0.5pt solid #999; }
@media print {
  body { background: #fff; }
  .page { width: auto; margin: 0; padding: 0; box-shadow: none; }
}`;

/** HTML hoàn chỉnh (kèm CSS in A4 và font nhúng) của hợp đồng thuê. */
export function renderContractHtml(
  data: ContractData,
  fontCss: string,
): string {
  const { store, customer, device } = data;
  const issued = dateParts(data.issuedAt);
  const no = contractNumber(data.bookingId, data.issuedAt);
  const [fullTier, partialTier] = REFUND_TIERS;
  const unitLabel = data.pricing.unit === 'hour' ? 'giờ' : 'ngày';
  const totalDays = Math.floor(data.pricing.totalHours / 24);
  const remainHours = data.pricing.totalHours % 24;
  const durationText =
    data.pricing.totalHours >= 24
      ? `${data.pricing.totalHours} giờ (${totalDays} ngày${remainHours ? ` ${remainHours} giờ` : ''})`
      : `${data.pricing.totalHours} giờ`;
  const lateRows = lateFeeExamples(device.pricePerDay, device.originalPrice)
    .map(
      (e) =>
        `<tr><td class="c">Trễ ${e.day} ngày</td><td class="c">${esc(formatMoney(e.dayFee))}</td><td class="c">${esc(formatMoney(e.total))}</td></tr>`,
    )
    .join('');

  const body = `
<p class="national">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
<p class="motto">Độc lập – Tự do – Hạnh phúc</p>
<p class="motto-line">———————————</p>
<h1>HỢP ĐỒNG THUÊ TÀI SẢN</h1>
<p class="subtitle">(Thiết bị điện tử)</p>
<p class="center">Số: ${esc(no)}</p>

<div class="bases">
<p>– Căn cứ Bộ luật Dân sự số 91/2015/QH13 ngày 24/11/2015, các quy định về hợp đồng thuê tài sản (Điều 472 đến Điều 482) và đặt cọc (Điều 328);</p>
<p>– Căn cứ Nghị định số 13/2023/NĐ-CP ngày 17/4/2023 của Chính phủ về bảo vệ dữ liệu cá nhân;</p>
<p>– Căn cứ nhu cầu và khả năng của hai bên.</p>
</div>

<p>Hôm nay, ngày ${issued.day} tháng ${issued.month} năm ${issued.year}, tại ${esc(store.address)}, chúng tôi gồm:</p>

<h2>BÊN CHO THUÊ (BÊN A): ${esc(store.legalName.toUpperCase())}</h2>
<table class="kv">
  ${row('Địa chỉ', esc(store.address))}
  ${row('Điện thoại', esc(store.phone))}
  ${row('Email', esc(store.email))}
  ${store.taxCode ? row('Mã số thuế', esc(store.taxCode)) : ''}
  ${row('Người đại diện', `${esc(store.representative)} — Chức vụ: ${esc(store.representativeTitle)}`)}
  ${row('Nhân viên lập hợp đồng', esc(data.staffName ?? DOTS))}
</table>

<h2>BÊN THUÊ (BÊN B): ${esc(customer.name.toUpperCase())}</h2>
<table class="kv">
  ${row('Số CCCD', esc(customer.cccd))}
  ${row('Ngày cấp / Nơi cấp', `${DOTS} / ${DOTS}`)}
  ${row('Địa chỉ thường trú', LONG_DOTS)}
  ${row('Điện thoại', esc(customer.phone ?? DOTS))}
  ${row('Email', esc(customer.email))}
</table>
<p><em>(Ngày cấp, nơi cấp và địa chỉ thường trú do nhân viên Bên A điền khi đối chiếu CCCD bản gốc của Bên B.)</em></p>

<p>Sau khi thoả thuận, hai bên thống nhất ký kết Hợp đồng thuê tài sản với các điều khoản sau:</p>

${clause(
  'Điều 1. Tài sản cho thuê',
  `<table class="kv">
  ${row('Tên thiết bị (model)', esc(device.name))}
  ${row('Danh mục', esc(device.category))}
  ${row('Hãng sản xuất', esc(device.brand ?? DOTS))}
  ${row('Số serial / IMEI', `<strong>${esc(device.serialNumber ?? DOTS)}</strong>`)}
  ${row('Giá trị tài sản', money(device.originalPrice))}
</table>
<p>Phụ kiện giao kèm (đánh dấu khi giao và khi trả):</p>
${accessoriesTable(device.accessories)}
<p>Tình trạng thiết bị khi giao: ${
    data.handover?.notes
      ? `${esc(data.handover.notes)} (ghi nhận lúc ${esc(formatDateTime(data.handover.at))}, kèm ${data.handover.images.length} ảnh chụp).`
      : 'ghi nhận tại Biên bản giao nhận thiết bị (Phụ lục 01) khi bàn giao.'
  } Biên bản giao nhận là bộ phận không tách rời của Hợp đồng.</p>`,
)}

${clause(
  'Điều 2. Thời hạn thuê, địa điểm giao nhận',
  `<ol>
<li>Thời hạn thuê: từ <strong>${esc(formatDateTime(data.startTime))}</strong> đến <strong>${esc(formatDateTime(data.endTime))}</strong>; tổng thời gian thuê ${esc(durationText)}.</li>
<li>Thiết bị được giao và nhận lại trực tiếp tại cửa hàng của Bên A (${esc(store.address)}). Bên A không giao hàng tận nơi. Khi nhận máy, Bên B xuất trình CCCD bản gốc để đối chiếu.</li>
<li>Khi giao và khi nhận lại thiết bị, hai bên lập Biên bản giao nhận có ảnh chụp tình trạng thiết bị (tối thiểu ${HANDOVER_MIN_PHOTOS} ảnh khi giao) làm căn cứ đối chiếu.</li>
</ol>`,
)}

${clause(
  'Điều 3. Giá thuê, tiền cọc và phương thức thanh toán',
  `<ol>
<li>Đơn giá thuê: ${esc(formatMoney(data.pricing.unitPrice))}/${unitLabel}; số ${unitLabel} tính tiền: ${data.pricing.quantity} ${unitLabel} (thời gian lẻ được làm tròn lên).</li>
<li>Tổng tiền thuê: ${money(data.pricing.total)}. Bên B thanh toán tại quầy khi nhận thiết bị, bằng tiền mặt hoặc chuyển khoản${
    data.rental.paid
      ? ` — đã thanh toán${data.rental.methodLabel ? ` bằng ${esc(data.rental.methodLabel.toLowerCase())}` : ''}${data.rental.paidAt ? ` lúc ${esc(formatDateTime(data.rental.paidAt))}` : ''}`
      : ''
  }.</li>
<li>Tiền đặt cọc: ${money(data.depositAmount)}, bằng ${formatPercent(DEPOSIT_RATIO)} giá trị tài sản, không phụ thuộc thời gian thuê. Bên B đã thanh toán tiền cọc trực tuyến qua cổng VNPay${
    data.deposit.txnRef
      ? `, mã giao dịch <strong>${esc(data.deposit.txnRef)}</strong>${data.deposit.paidAt ? `, lúc ${esc(formatDateTime(data.deposit.paidAt))}` : ''}`
      : `, mã giao dịch: ${DOTS}`
  }.</li>
</ol>`,
)}

${clause(
  'Điều 4. Quyền và nghĩa vụ của Bên A',
  `<ol>
<li>Giao đúng thiết bị, đúng số serial/IMEI và đủ phụ kiện như Điều 1, đúng thời điểm tại Điều 2; thiết bị hoạt động bình thường khi giao.</li>
<li>Hỗ trợ Bên B khi thiết bị gặp lỗi trong thời gian thuê theo Điều 6.</li>
<li>Hoàn trả tiền cọc đúng số tiền và đúng thời hạn theo Điều 8.</li>
<li>Bảo mật thông tin cá nhân của Bên B theo Điều 10; chỉ sử dụng cho mục đích của Hợp đồng.</li>
<li>Được nhận đủ tiền thuê, được khấu trừ các khoản phí theo Hợp đồng và được yêu cầu Bên B bồi thường thiệt hại do lỗi của Bên B.</li>
</ol>`,
)}

${clause(
  'Điều 5. Quyền và nghĩa vụ của Bên B',
  `<ol>
<li>Được sử dụng thiết bị đúng công năng trong thời hạn thuê; được hỗ trợ khi thiết bị gặp lỗi theo Điều 6.</li>
<li>Thanh toán đủ tiền thuê và tiền cọc theo Điều 3.</li>
<li>Bảo quản thiết bị và phụ kiện cẩn thận; không tự ý tháo rời, sửa chữa hoặc mang đi sửa ở nơi khác; không cho thuê lại, cho mượn, cầm cố hay chuyển giao thiết bị cho người khác.</li>
<li>Trả thiết bị đúng hạn, đủ phụ kiện, tại cửa hàng của Bên A.</li>
<li>Bồi thường thiệt hại do lỗi của mình theo Điều 6, Điều 8 và Điều 9.</li>
</ol>`,
)}

${clause(
  'Điều 6. Thiết bị gặp lỗi trong thời gian thuê',
  `<ol>
<li>Khi thiết bị gặp lỗi, Bên B báo ngay cho Bên A qua chức năng “Báo lỗi thiết bị” trên website TechRent, mô tả lỗi và gửi kèm ảnh/video; không tự sửa chữa.</li>
<li>Lỗi do thiết bị: Bên A đổi cho Bên B thiết bị cùng loại có giá trị tương đương (chênh lệch giá trị không quá ${formatPercent(REPLACEMENT_VALUE_TOLERANCE)}), thời hạn thuê, giá thuê và tiền cọc giữ nguyên; trường hợp không có thiết bị thay thế, Hợp đồng kết thúc sớm, Bên A hoàn tiền thuê tương ứng phần thời gian chưa sử dụng (làm tròn xuống đến nghìn đồng) và hoàn đủ tiền cọc.</li>
<li>Lỗi do Bên B (rơi vỡ, vào nước, sử dụng sai cách…): Bên B chịu chi phí sửa chữa thực tế; chi phí này được trừ vào tiền cọc khi trả thiết bị.</li>
</ol>`,
)}

${clause(
  'Điều 7. Trả thiết bị trễ hạn',
  `<ol>
<li>Trả thiết bị sau thời điểm kết thúc tại Điều 2 bị tính phí trễ hạn LEO THANG: ngày trễ thứ N chịu phí bằng N × ${formatPercent(LATE_FEE_DAILY_RATIO)} giá thuê/ngày; tổng phí trễ hạn là tổng phí của tất cả các ngày trễ và không vượt quá giá trị tài sản tại Điều 1. Trễ chưa đủ một ngày được tính là một ngày.</li>
<li>Phí trễ hạn được trừ vào tiền cọc khi trả thiết bị. Ví dụ với thiết bị của Hợp đồng này (giá thuê ${esc(formatMoney(device.pricePerDay))}/ngày):</li>
</ol>
<table class="grid">
  <thead><tr><th>Số ngày trễ</th><th>Phí của ngày trễ cuối</th><th>Tổng phí trễ hạn</th></tr></thead>
  <tbody>${lateRows}</tbody>
</table>`,
)}

${clause(
  'Điều 8. Đặt cọc và hoàn trả tiền cọc',
  `<ol>
<li>Huỷ đơn trước khi nhận thiết bị: hoàn ${fullTier.percentage}% tiền cọc nếu huỷ trước thời điểm nhận từ ${fullTier.minHoursBeforeStart} giờ trở lên; hoàn ${partialTier.percentage}% nếu huỷ trước từ ${partialTier.minHoursBeforeStart} giờ đến dưới ${fullTier.minHoursBeforeStart} giờ; không hoàn nếu huỷ trước dưới ${partialTier.minHoursBeforeStart} giờ. Đơn bị huỷ do lỗi của Bên A được hoàn ${fullTier.percentage}% tiền cọc.</li>
<li>Khi Bên B trả thiết bị lúc kết thúc thời hạn thuê: Tiền cọc hoàn lại = Tiền cọc − Phí trễ hạn (Điều 7) − Phí hư hỏng/thiếu phụ kiện (đối chiếu Biên bản giao nhận) − Chi phí sửa chữa do lỗi của Bên B (Điều 6). Bên A chuyển khoản số tiền hoàn lại trong tối đa ${DEPOSIT_REFUND_BUSINESS_DAYS} ngày làm việc kể từ ngày nhận lại thiết bị hoặc ngày huỷ đơn.</li>
<li>Nếu tổng các khoản khấu trừ lớn hơn tiền cọc, phần chênh lệch là khoản nợ Bên B phải thanh toán cho Bên A; khi chưa thanh toán hết khoản nợ, Bên B không được thuê thiết bị tiếp.</li>
</ol>`,
)}

${clause(
  'Điều 9. Không trả thiết bị, mất thiết bị',
  `<ol>
<li>Quá thời hạn thuê từ ${LOST_SUSPECT_OVERDUE_DAYS} ngày trở lên mà Bên B không trả thiết bị hoặc không liên lạc được, thiết bị được coi là nghi mất.</li>
<li>Khi Bên A xác nhận mất thiết bị: Bên A giữ toàn bộ tiền cọc; Bên B phải thanh toán thêm khoản nợ bằng giá trị tài sản trừ tiền cọc, cộng phí trễ hạn; tổng số tiền Bên A yêu cầu (gồm tiền cọc) không vượt quá ${formatPercent(LOST_DEVICE_MAX_CLAIM_RATIO)} giá trị tài sản. Tài khoản của Bên B bị đưa vào danh sách đen, không được thuê tiếp.</li>
<li>Bên A được sử dụng thông tin CCCD, ảnh chân dung xác thực, Hợp đồng này và Biên bản giao nhận để trình báo cơ quan công an và/hoặc khởi kiện tại Toà án có thẩm quyền.</li>
</ol>`,
)}

${clause(
  'Điều 10. Xử lý dữ liệu cá nhân',
  `<p>Bên B đồng ý để Bên A xử lý dữ liệu cá nhân (họ tên, số CCCD, ảnh CCCD, ảnh chân dung, số điện thoại, email, lịch sử thuê) theo Nghị định 13/2023/NĐ-CP, cho các mục đích: xác minh danh tính, thực hiện Hợp đồng và giải quyết tranh chấp. Số CCCD được mã hoá khi lưu trữ; ảnh giấy tờ được lưu riêng tư và chỉ người có thẩm quyền của Bên A được xem. Bên B có quyền yêu cầu xem, chỉnh sửa dữ liệu của mình theo quy định của pháp luật.</p>`,
)}

${clause(
  'Điều 11. Bất khả kháng',
  `<p>Bên nào không thực hiện được nghĩa vụ do sự kiện bất khả kháng (thiên tai, hoả hoạn, dịch bệnh, quyết định của cơ quan nhà nước có thẩm quyền…) theo Điều 156 Bộ luật Dân sự 2015 thì không bị coi là vi phạm, nhưng phải thông báo ngay cho bên kia và áp dụng mọi biện pháp cần thiết để hạn chế thiệt hại.</p>`,
)}

<div class="keep closing">${clause(
    'Điều 12. Điều khoản chung',
    `<ol>
<li>Hai bên cam kết thực hiện đúng các điều khoản của Hợp đồng. Tranh chấp phát sinh được ưu tiên giải quyết bằng thương lượng; nếu không thoả thuận được, một trong hai bên có quyền khởi kiện tại Toà án có thẩm quyền.</li>
<li>Các phụ lục (Biên bản giao nhận thiết bị${data.swaps.length ? ', Phụ lục đổi thiết bị' : ''}) là bộ phận không tách rời của Hợp đồng.</li>
<li>Hợp đồng có hiệu lực kể từ khi hai bên ký, được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản.</li>
</ol>`,
  )}

${signatures('ĐẠI DIỆN BÊN A', 'BÊN B', store.representative, customer.name, store.city)}</div>

${handoverAnnex(data)}
${swapAnnex(data)}`;

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hợp đồng ${esc(no)}</title>
<style>${fontCss}
${STYLES}</style>
</head>
<body><main class="page">${body}</main></body>
</html>`.normalize('NFC');
}
