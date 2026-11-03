# Chính sách thuê thiết bị TechRent

## Tóm tắt chính sách cốt lõi
- Tiền cọc bằng {{DEPOSIT_RATE}} giá trị (giá gốc) của thiết bị, không phụ thuộc thời gian thuê.
- Đơn mới ở trạng thái "Chờ thanh toán" được giữ chỗ {{BOOKING_TTL_MINUTES}} phút; quá thời gian chưa thanh toán cọc thì đơn tự huỷ.
- Tiền cọc thanh toán online qua VNPay; tiền thuê thanh toán tại quầy khi nhận máy (tiền mặt hoặc chuyển khoản).
- Chỉ nhận và trả máy tại cửa hàng, KHÔNG giao hàng tận nơi.
- Khi trả máy: tiền cọc hoàn lại = tiền cọc − phí trễ hạn − phí hư hỏng; hoàn bằng chuyển khoản trong tối đa {{DEPOSIT_REFUND_BUSINESS_DAYS}} ngày làm việc.
- Huỷ đơn: trước giờ nhận máy từ {{REFUND_FULL_HOURS}} giờ trở lên hoàn {{REFUND_FULL_PERCENT}} cọc; từ {{REFUND_PARTIAL_HOURS}} đến dưới {{REFUND_FULL_HOURS}} giờ hoàn {{REFUND_PARTIAL_PERCENT}}; dưới {{REFUND_PARTIAL_HOURS}} giờ hoặc đã nhận máy thì không hoàn, trừ khi lỗi thuộc về cửa hàng.
- Trả máy trễ bị phạt leo thang: {{LATE_FEE_RULE}}
- Phải xác thực danh tính (số CCCD + ảnh CCCD 2 mặt + ảnh chân dung) trước khi đặt thuê.

## Tiền đặt cọc
- Tiền cọc = {{DEPOSIT_RATE}} giá trị tài sản (giá gốc) của thiết bị. Giá trị này hiển thị ở trang chi tiết thiết bị, dòng "Giá trị tài sản".
- Tiền cọc KHÔNG phụ thuộc thời gian thuê: thuê 1 giờ hay 1 tuần thì tiền cọc như nhau, vì rủi ro mất/hỏng thiết bị là như nhau.
- Ví dụ: thiết bị có giá trị {{DEPOSIT_EXAMPLE_PRICE}} thì tiền cọc là {{DEPOSIT_EXAMPLE_AMOUNT}}.
- Tiền cọc được thanh toán online qua VNPay ngay sau khi tạo đơn.

## Cách tính tiền thuê
- Thuê từ {{HOURLY_PRICING_MAX_HOURS}} giờ trở xuống: tính theo giá thuê/giờ, số giờ được làm tròn lên (thuê 2 giờ 10 phút tính 3 giờ).
- Thuê trên {{HOURLY_PRICING_MAX_HOURS}} giờ: tính theo giá thuê/ngày, số ngày được làm tròn lên (thuê 1 ngày 2 giờ tính 2 ngày).
- Giá thuê/giờ và giá thuê/ngày của từng thiết bị hiển thị ở trang danh sách và trang chi tiết thiết bị.
- Tiền thuê và tiền cọc là 2 khoản khác nhau: tiền cọc trả online qua VNPay ngay sau khi đặt; tiền thuê trả tại quầy khi nhận máy, bằng tiền mặt hoặc chuyển khoản. Nhân viên bấm "Đã thu tiền thuê" và bạn nhận thông báo xác nhận.

## Giữ chỗ khi chưa thanh toán
- Sau khi đặt thuê, đơn ở trạng thái "Chờ thanh toán" và thiết bị được giữ chỗ trong {{BOOKING_TTL_MINUTES}} phút.
- Trang chi tiết đơn có đồng hồ đếm ngược và nút "Thanh toán ngay".
- Hết {{BOOKING_TTL_MINUTES}} phút mà chưa thanh toán cọc, đơn tự động bị huỷ và khung giờ đó được mở lại cho người khác. Bạn có thể đặt lại nếu thiết bị vẫn còn trống.

## Thanh toán qua VNPay
- Bấm "Thanh toán ngay" ở trang chi tiết đơn, hệ thống chuyển sang cổng VNPay để thanh toán tiền cọc (thẻ ATM nội địa, thẻ quốc tế hoặc ứng dụng ngân hàng theo các lựa chọn VNPay cung cấp).
- Sau khi thanh toán thành công, đơn tự chuyển sang "Đã xác nhận" và bạn nhận được thông báo.
- Nếu đã trừ tiền nhưng đơn chưa đổi trạng thái, đừng thanh toán lại — hãy liên hệ nhân viên TechRent kèm mã đơn để được kiểm tra.
- TechRent không bao giờ yêu cầu bạn gửi mật khẩu, mã OTP hay thông tin thẻ qua chat.

## Huỷ đơn và hoàn cọc
- Bạn có thể huỷ đơn ở trang "Đơn của tôi" khi đơn đang "Chờ thanh toán" hoặc "Đã xác nhận".
- Mức hoàn cọc tính theo thời gian còn lại tới giờ nhận thiết bị:
  - Từ {{REFUND_FULL_HOURS}} giờ trở lên: hoàn {{REFUND_FULL_PERCENT}} tiền cọc.
  - Từ {{REFUND_PARTIAL_HOURS}} giờ đến dưới {{REFUND_FULL_HOURS}} giờ: hoàn {{REFUND_PARTIAL_PERCENT}} tiền cọc.
  - Dưới {{REFUND_PARTIAL_HOURS}} giờ hoặc sau khi đã nhận thiết bị: không hoàn cọc.
- Ví dụ: {{REFUND_EXAMPLES}}.
- Nếu đơn bị huỷ do lỗi từ phía cửa hàng (ví dụ thiết bị không giao được), bạn được hoàn {{REFUND_FULL_PERCENT}} tiền cọc bất kể thời điểm.
- Đơn "Chờ thanh toán" chưa trả cọc thì huỷ không phát sinh tiền.
- Hộp thoại huỷ đơn hiển thị trước mức hoàn cọc ước tính để bạn xem trước khi xác nhận.
- Tiền cọc được hoàn bằng chuyển khoản thủ công trong tối đa {{DEPOSIT_REFUND_BUSINESS_DAYS}} ngày làm việc (không tính thứ Bảy, Chủ nhật) kể từ lúc huỷ đơn. Khi tiền được chuyển, bạn nhận thông báo kèm mã giao dịch.

## Hoàn cọc sau khi trả máy
- Khi trả máy tại cửa hàng, nhân viên kiểm tra tình trạng thiết bị và phụ kiện, đối chiếu với ảnh chụp lúc giao máy.
- Công thức: tiền cọc hoàn lại = tiền cọc − phí trễ hạn − phí hư hỏng/thiếu phụ kiện.
- Ví dụ: {{SETTLEMENT_EXAMPLE}}
- Nếu tổng khoản trừ lớn hơn tiền cọc, bạn không được hoàn cọc và phải thanh toán thêm phần còn thiếu cho cửa hàng.
- Tiền cọc hoàn lại được chuyển khoản trong tối đa {{DEPOSIT_REFUND_BUSINESS_DAYS}} ngày làm việc (không tính thứ Bảy, Chủ nhật) kể từ khi trả máy. Khi chuyển xong, bạn nhận thông báo kèm mã giao dịch.
- Trang chi tiết đơn hiển thị bảng khấu trừ (tiền cọc, phí trễ hạn, phí hư hỏng, số tiền hoàn) và trạng thái hoàn cọc: Chờ hoàn cọc, Đã hoàn cọc hoặc Không hoàn cọc.

## Nhận và trả máy tại cửa hàng
- TechRent KHÔNG giao hàng tận nơi. Bạn nhận và trả máy trực tiếp tại cửa hàng.
- Lý do: nhân viên cần đối chiếu CCCD gốc của bạn và cùng bạn ký hợp đồng trực tiếp.
- Khi giao máy, nhân viên chụp tối thiểu {{HANDOVER_MIN_PHOTOS}} ảnh tình trạng thiết bị và ghi chú vết trầy, phụ kiện kèm theo (biên bản giao máy).
- Khi trả máy, ảnh lúc giao được đặt cạnh ảnh lúc trả để đối chiếu, làm căn cứ tính phí hư hỏng nếu có.

## Phí trả máy trễ hạn
- Trả trễ bị phạt LEO THANG theo từng ngày trễ: {{LATE_FEE_RULE}}
- Trễ dù chỉ vài giờ cũng được tính là 1 ngày trễ (làm tròn lên).
- Tổng phí trễ hạn không vượt quá giá trị thiết bị.
- Ví dụ thiết bị giá thuê {{LATE_FEE_EXAMPLE_PRICE_PER_DAY}}/ngày: trễ 1 ngày phạt {{LATE_FEE_EXAMPLE_1DAY}}; trễ 2 ngày phạt tổng {{LATE_FEE_EXAMPLE_2DAYS}}; trễ 3 ngày phạt tổng {{LATE_FEE_EXAMPLE_3DAYS}}.
- Phí trễ hạn được trừ vào tiền cọc khi trả máy và hiển thị riêng trong bảng khấu trừ ở chi tiết đơn.
- Nếu biết mình sẽ trả muộn, hãy liên hệ nhân viên càng sớm càng tốt.

## Danh sách đen
- Khách làm mất thiết bị, cố ý không trả hoặc không liên lạc được sau thời hạn thuê có thể bị đưa vào danh sách đen.
- Tài khoản trong danh sách đen không thể đặt thuê, và số CCCD đó cũng không thể dùng để đăng ký tài khoản mới.
- Cửa hàng có quyền dùng thông tin xác thực danh tính và hợp đồng để trình báo cơ quan công an hoặc khởi kiện.
- Nếu bạn bị chặn đặt thuê và cho rằng có nhầm lẫn, vui lòng liên hệ nhân viên TechRent.
