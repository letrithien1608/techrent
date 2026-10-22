// Hàm thuần (không NestJS DI) — cùng style `vnpay.util.ts`/`cccd-crypto.util.ts`.
// Sinh nội dung hợp đồng thuê thiết bị dạng text, dùng chung cho 2 nơi gọi:
// (1) BookingsService.confirm()/PaymentsService.confirmBookingAfterPayment() —
//     lưu bản MASKED CCCD vào Booking.contractContent (an toàn, lưu lâu dài);
// (2) BookingsService.getContractForPrint() — sinh TẠM bản CCCD ĐẦY ĐỦ để in,
//     KHÔNG BAO GIỜ lưu lại bản này (chỉ admin/staff gọi được, xem mục 7 Roadmap).

const STORE_NAME = 'TechRent';
const STORE_DESCRIPTION = 'Dịch vụ cho thuê thiết bị điện tử';

export interface ContractTemplateData {
  bookingId: string;
  createdAt: Date;
  startTime: Date;
  endTime: Date;
  totalPrice: number;
  depositAmount: number;
  customerName: string;
  customerCccd: string;
  customerPhone: string | null;
  deviceName: string;
  deviceCondition: string | null;
  deviceOriginalPrice: number;
  devicePricePerDay: number;
}

function formatVnd(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

export function buildContractContent(data: ContractTemplateData): string {
  const contractNo = data.bookingId.slice(0, 8).toUpperCase();
  const lateFeeDay1 = formatVnd(data.devicePricePerDay * 0.2);
  const lateFeeDay2 = formatVnd(data.devicePricePerDay * 0.2 * 2);

  return `HỢP ĐỒNG THUÊ THIẾT BỊ
Số hợp đồng: ${contractNo} (mã booking đầy đủ: ${data.bookingId})
Ngày lập: ${formatDateTime(data.createdAt)}

ĐIỀU 1 — CÁC BÊN KÝ HỢP ĐỒNG
Bên A (Bên cho thuê): ${STORE_NAME} — ${STORE_DESCRIPTION}
Bên B (Bên thuê):
  - Họ và tên: ${data.customerName}
  - Số CCCD: ${data.customerCccd}
  - Số điện thoại: ${data.customerPhone ?? '(chưa cung cấp)'}

ĐIỀU 2 — THIẾT BỊ CHO THUÊ
  - Tên thiết bị: ${data.deviceName}
  - Tình trạng thiết bị lúc giao: ${data.deviceCondition ?? '(không có mô tả chi tiết, xem thực tế lúc giao nhận)'}
  - Giá trị thiết bị (tài sản): ${formatVnd(data.deviceOriginalPrice)}

ĐIỀU 3 — THỜI HẠN THUÊ
  - Từ: ${formatDateTime(data.startTime)}
  - Đến: ${formatDateTime(data.endTime)}

ĐIỀU 4 — GIÁ THUÊ VÀ TIỀN CỌC
  - Tổng tiền thuê: ${formatVnd(data.totalPrice)}
  - Tiền đặt cọc: ${formatVnd(data.depositAmount)} (tương đương 50% giá trị thiết bị, hoàn lại theo chính sách tại Điều 6)

ĐIỀU 5 — TRÁCH NHIỆM CỦA BÊN B
  1. Bên B có trách nhiệm bảo quản thiết bị trong tình trạng tốt, sử dụng đúng mục đích, không tự ý sửa chữa, tháo rời hoặc cho bên thứ ba thuê lại.
  2. Nếu thiết bị bị hư hỏng do lỗi của Bên B trong thời gian thuê, Bên B phải bồi thường chi phí sửa chữa thực tế; nếu hư hỏng không thể sửa chữa hoặc thiết bị bị mất, Bên B phải bồi thường 100% giá trị thiết bị nêu tại Điều 2.
  3. Bên B phải trả lại thiết bị đúng thời hạn nêu tại Điều 3, kèm đầy đủ phụ kiện đã nhận (nếu có).

ĐIỀU 6 — PHẠT TRỄ HẠN VÀ HOÀN TRẢ TIỀN CỌC
  1. Nếu trả thiết bị trễ hạn, Bên B phải chịu phạt LEO THANG theo từng ngày trễ: ngày trễ thứ 1 phạt ${lateFeeDay1} (20% giá thuê/ngày), ngày trễ thứ 2 phạt THÊM ${lateFeeDay2} (40% giá thuê/ngày), các ngày tiếp theo tiếp tục tăng thêm 20 điểm phần trăm mỗi ngày — tổng phí trễ hạn được cộng dồn qua tất cả các ngày trễ và KHÔNG vượt quá giá trị thiết bị nêu tại Điều 2.
  2. Tiền cọc được hoàn lại theo chính sách: hoàn 100% nếu huỷ trước giờ nhận thiết bị tối thiểu 24 giờ; hoàn 50% nếu huỷ trong khoảng 6-24 giờ trước giờ nhận; không hoàn cọc nếu huỷ trong vòng 6 giờ trước giờ nhận hoặc sau khi đã nhận thiết bị, trừ trường hợp lỗi thuộc về Bên A.
  3. Trường hợp thiết bị có hư hỏng/thiếu hụt khi trả lại, Bên A có quyền trừ chi phí khắc phục vào tiền cọc trước khi hoàn trả phần còn lại (nếu có) cho Bên B.

ĐIỀU 7 — XỬ LÝ KHI MẤT HOẶC CHIẾM GIỮ THIẾT BỊ
  1. Nếu Bên B làm mất thiết bị hoặc cố ý không trả lại thiết bị sau khi đã được Bên A yêu cầu bằng văn bản/tin nhắn/điện thoại, Bên A có quyền yêu cầu bồi thường toàn bộ giá trị thiết bị nêu tại Điều 2.
  2. Nếu Bên B có hành vi chiếm giữ thiết bị trái phép sau thời hạn thuê mà không hoàn trả hoặc không liên hệ với Bên A, Bên A có quyền trình báo cơ quan công an có thẩm quyền và/hoặc khởi kiện tại Toà án nhân dân có thẩm quyền để bảo vệ quyền lợi hợp pháp của mình.

ĐIỀU 8 — ĐIỀU KHOẢN CHUNG
  1. Hai bên cam kết thực hiện đúng các điều khoản đã thoả thuận trong hợp đồng này.
  2. Mọi tranh chấp phát sinh (nếu có) được hai bên ưu tiên giải quyết thông qua thương lượng; nếu không đạt được thoả thuận, tranh chấp được giải quyết theo quy định pháp luật hiện hành.
  3. Hợp đồng có hiệu lực từ thời điểm hai bên ký tên và được lập thành 02 bản, mỗi bên giữ 01 bản có giá trị pháp lý như nhau.


        ĐẠI DIỆN BÊN A                              BÊN B (KHÁCH THUÊ)
     (Ký, ghi rõ họ tên)                           (Ký, ghi rõ họ tên)



  .........................                      .........................
`;
}
