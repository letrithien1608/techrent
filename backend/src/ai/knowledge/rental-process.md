# Quy trình thuê thiết bị TechRent

## Bước 1: Đăng ký tài khoản
- Đăng ký ở trang "Đăng ký" với họ tên, email, mật khẩu (tối thiểu 8 ký tự), số điện thoại (10 số, bắt đầu bằng 0) và số CCCD (12 số).
- Mỗi số CCCD và mỗi số điện thoại chỉ dùng được cho 1 tài khoản.
- Hệ thống gửi email xác thực tới địa chỉ email bạn đăng ký.
- Quên mật khẩu: bấm "Quên mật khẩu?" ở trang đăng nhập, link đặt lại gửi qua email và chỉ dùng được 1 lần trong 15 phút.

## Bước 2: Xác thực danh tính (CCCD và ảnh chân dung)
- Trước khi đặt thuê, bạn cần hoàn tất xác thực danh tính ở trang "Tài khoản của tôi", mục "Xác thực danh tính".
- Giấy tờ cần có: số CCCD (đã nhập khi đăng ký), ảnh CCCD mặt trước, ảnh CCCD mặt sau và 1 ảnh chân dung (selfie) rõ mặt.
- Chụp ảnh đủ sáng, không bị lóa, thấy rõ 4 góc thẻ và chữ số.
- Ảnh được lưu riêng tư, chỉ quản trị viên xem được qua đường link có hạn 5 phút.
- Hồ sơ chỉ nộp 1 lần; muốn nộp lại thì liên hệ nhân viên để được mở lại.
- Nếu chưa xác thực, hệ thống sẽ chặn đặt thuê và chỉ dẫn bạn tới đúng mục cần bổ sung.

## Bước 3: Chọn thiết bị
- Vào trang "Thiết bị" để tìm theo tên, lọc theo danh mục, bật "Còn hàng" và sắp xếp theo giá.
- Trang chi tiết thiết bị có ảnh, thông số kỹ thuật, mô tả tình trạng, giá thuê/giờ, giá thuê/ngày, giá trị tài sản và đánh giá của khách trước.
- Thiết bị đang bảo trì hoặc hỏng thì không đặt được.

## Bước 4: Đặt lịch thuê
- Ở trang chi tiết, bấm chọn ngày và giờ nhận, giờ trả, rồi bấm "Đặt thuê ngay".
- Không chọn được thời điểm trong quá khứ; giờ trả phải sau giờ nhận.
- Nếu khung giờ đã có người đặt, hệ thống báo trùng lịch để bạn chọn khung khác.
- Đặt xong, đơn ở trạng thái "Chờ thanh toán" và được giữ chỗ {{BOOKING_TTL_MINUTES}} phút.

## Bước 5: Thanh toán tiền cọc
- Bấm "Thanh toán ngay" để thanh toán tiền cọc ({{DEPOSIT_RATE}} giá trị thiết bị) qua VNPay.
- Thanh toán thành công, đơn chuyển sang "Đã xác nhận" và bạn nhận thông báo trên chuông thông báo.
- Hợp đồng thuê được hệ thống tự lập khi đơn được xác nhận.

## Bước 6: Ký hợp đồng và nhận thiết bị
- Đến giờ nhận, nhân viên đối chiếu CCCD của bạn với hồ sơ đã xác thực.
- Nhân viên in hợp đồng thuê để bạn đọc và ký tay; cửa hàng giữ 1 bản, bạn giữ 1 bản.
- Hai bên kiểm tra tình trạng thiết bị và phụ kiện lúc giao.
- Sau khi giao máy, đơn chuyển sang "Đang thuê".

## Bước 7: Trả thiết bị
- Trả thiết bị đúng giờ đã đặt, kèm đầy đủ phụ kiện đã nhận.
- Nhân viên kiểm tra tình trạng máy rồi hoàn tất đơn ("Hoàn tất").
- Trả trễ sẽ bị tính phí trễ hạn leo thang: {{LATE_FEE_RULE}}

## Bước 8: Hoàn cọc và đánh giá
- Sau khi trả máy, nhân viên xử lý hoàn cọc; chi phí khắc phục hư hỏng/thiếu phụ kiện do bên thuê (nếu có) có thể được trừ vào cọc.
- Đơn "Hoàn tất" có nút đánh giá: chấm 1-5 sao và viết nhận xét (mỗi đơn đánh giá 1 lần).

## Theo dõi đơn của tôi
- Trang "Đơn của tôi" liệt kê mọi đơn, lọc theo trạng thái: Chờ thanh toán, Đã xác nhận, Đang thuê, Hoàn tất, Đã huỷ.
- Chuông thông báo trên thanh đầu trang báo khi đơn được xác nhận, bắt đầu thuê hoặc bị huỷ.
