# Chính sách thuê thiết bị TechRent

## Tóm tắt chính sách cốt lõi
- Tiền cọc bằng {{DEPOSIT_RATE}} giá trị (giá gốc) của thiết bị, không phụ thuộc thời gian thuê.
- Đơn mới ở trạng thái "Chờ thanh toán" được giữ chỗ {{BOOKING_TTL_MINUTES}} phút; quá thời gian chưa thanh toán cọc thì đơn tự huỷ.
- Thanh toán tiền cọc online qua VNPay.
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
- Tiền thuê và tiền cọc là 2 khoản khác nhau. Hệ thống hiện thu tiền cọc online qua VNPay; với khoản tiền thuê, nhân viên TechRent sẽ hướng dẫn cụ thể khi xác nhận đơn.

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
- Nếu đơn bị huỷ do lỗi từ phía cửa hàng (ví dụ thiết bị không giao được), bạn được hoàn {{REFUND_FULL_PERCENT}} tiền cọc bất kể thời điểm.
- Đơn "Chờ thanh toán" chưa trả cọc thì huỷ không phát sinh tiền.
- Hộp thoại huỷ đơn hiển thị trước mức hoàn cọc ước tính để bạn xem trước khi xác nhận.
- Thời gian tiền hoàn về tài khoản phụ thuộc ngân hàng/VNPay; nhân viên TechRent sẽ hỗ trợ xử lý và theo dõi giúp bạn.

## Hoàn cọc sau khi trả máy
- Khi trả máy, nhân viên kiểm tra tình trạng thiết bị và phụ kiện.
- Nếu thiết bị có hư hỏng hoặc thiếu phụ kiện do bên thuê, chi phí khắc phục có thể được trừ vào tiền cọc trước khi hoàn phần còn lại.
- Phí trễ hạn (nếu có) được cộng vào tổng tiền phải trả của đơn.
- Thời gian và hình thức hoàn cọc sau khi trả máy: nhân viên TechRent sẽ hỗ trợ xử lý trực tiếp với bạn.

## Phí trả máy trễ hạn
- Trả trễ bị phạt LEO THANG theo từng ngày trễ: {{LATE_FEE_RULE}}
- Trễ dù chỉ vài giờ cũng được tính là 1 ngày trễ (làm tròn lên).
- Tổng phí trễ hạn không vượt quá giá trị thiết bị.
- Ví dụ thiết bị giá thuê {{LATE_FEE_EXAMPLE_PRICE_PER_DAY}}/ngày: trễ 1 ngày phạt {{LATE_FEE_EXAMPLE_1DAY}}; trễ 2 ngày phạt tổng {{LATE_FEE_EXAMPLE_2DAYS}}; trễ 3 ngày phạt tổng {{LATE_FEE_EXAMPLE_3DAYS}}.
- Phí trễ hạn hiển thị riêng trong chi tiết đơn để bạn thấy rõ.
- Nếu biết mình sẽ trả muộn, hãy liên hệ nhân viên càng sớm càng tốt.

## Danh sách đen
- Khách làm mất thiết bị, cố ý không trả hoặc không liên lạc được sau thời hạn thuê có thể bị đưa vào danh sách đen.
- Tài khoản trong danh sách đen không thể đặt thuê, và số CCCD đó cũng không thể dùng để đăng ký tài khoản mới.
- Cửa hàng có quyền dùng thông tin xác thực danh tính và hợp đồng để trình báo cơ quan công an hoặc khởi kiện.
- Nếu bạn bị chặn đặt thuê và cho rằng có nhầm lẫn, vui lòng liên hệ nhân viên TechRent.
