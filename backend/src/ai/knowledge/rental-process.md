# Quy trình thuê thiết bị TechRent

## Tóm tắt các bước thuê thiết bị
1. Đăng ký tài khoản (email, số điện thoại, số CCCD).
2. Xác thực danh tính: nộp ảnh CCCD mặt trước, mặt sau và ảnh chân dung ở trang "Tài khoản của tôi".
3. Chọn thiết bị ở trang "Thiết bị".
4. Chọn ngày giờ nhận/trả và bấm "Đặt thuê ngay" (đơn được giữ chỗ {{BOOKING_TTL_MINUTES}} phút).
5. Thanh toán tiền cọc ({{DEPOSIT_RATE}} giá trị thiết bị) qua VNPay.
6. Đến cửa hàng nhận máy (không giao tận nơi): nhân viên đối chiếu CCCD gốc, bạn thanh toán tiền thuê tại quầy, ký hợp đồng, hai bên lập biên bản giao máy có ảnh.
7. Trả máy tại cửa hàng đúng hạn kèm đủ phụ kiện; nhân viên đối chiếu ảnh lúc giao và quyết toán cọc.
8. Nhận hoàn cọc bằng chuyển khoản trong tối đa {{DEPOSIT_REFUND_BUSINESS_DAYS}} ngày làm việc; có thể đánh giá thiết bị ở trang chi tiết thiết bị.

## Bước 1: Đăng ký tài khoản
- Đăng ký ở trang "Đăng ký" với họ tên, email, mật khẩu (tối thiểu 8 ký tự), số điện thoại (10 số, bắt đầu bằng 0) và số CCCD (12 số).
- Mỗi số CCCD và mỗi số điện thoại chỉ dùng được cho 1 tài khoản.
- Hệ thống gửi email xác thực tới địa chỉ email bạn đăng ký.
- Có thể bấm "Tiếp tục với Google" hoặc "Tiếp tục với Facebook" thay cho email + mật khẩu, nhưng lần đầu vẫn phải nhập số điện thoại, số CCCD và đồng ý điều khoản; sau đó vẫn phải làm eKYC như tài khoản thường.
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

## Bước 6: Nhận thiết bị tại cửa hàng
- Đến cửa hàng đúng giờ nhận (TechRent không giao hàng tận nơi), mang theo CCCD gốc để nhân viên đối chiếu với hồ sơ đã xác thực.
- Thanh toán tiền thuê tại quầy bằng tiền mặt hoặc chuyển khoản; bạn nhận thông báo "Đã thu tiền thuê".
- Nhân viên in hợp đồng thuê để bạn đọc và ký tay; cửa hàng giữ 1 bản, bạn giữ 1 bản.
- Nhân viên chụp tối thiểu {{HANDOVER_MIN_PHOTOS}} ảnh tình trạng thiết bị và ghi chú phụ kiện kèm theo (biên bản giao máy).
- Chỉ khi đủ 3 việc (đã thu tiền thuê, đã ký hợp đồng, đã lập biên bản giao máy) đơn mới chuyển sang "Đang thuê".

## Bước 7: Trả thiết bị
- Trả thiết bị đúng giờ đã đặt, kèm đầy đủ phụ kiện đã nhận.
- Mang máy đến cửa hàng; nhân viên chọn tình trạng (nguyên vẹn, hư hỏng hoặc thiếu phụ kiện), đối chiếu với ảnh lúc giao rồi xác nhận trả máy. Đơn chuyển sang "Đã trả máy".
- Trả trễ sẽ bị tính phí trễ hạn leo thang (trừ vào tiền cọc): {{LATE_FEE_RULE}}

## Bước 8: Hoàn cọc và đánh giá
- Tiền cọc hoàn lại = tiền cọc − phí trễ hạn − phí hư hỏng; chuyển khoản trong tối đa {{DEPOSIT_REFUND_BUSINESS_DAYS}} ngày làm việc, bạn nhận thông báo kèm mã giao dịch.
- Đánh giá thiết bị ở trang chi tiết thiết bị (đơn "Đã trả máy" có đường dẫn tới đó): chấm 1-5 sao và viết nhận xét, mỗi tài khoản 1 đánh giá cho mỗi thiết bị, sửa được sau. Đánh giá của người đã thuê có nhãn "Đã thuê thiết bị này".

## Theo dõi đơn của tôi
- Trang "Đơn của tôi" liệt kê mọi đơn, lọc theo trạng thái: Chờ thanh toán, Đã xác nhận, Đang thuê, Đã trả máy, Đã huỷ.
- Trang chi tiết đơn có dòng thời gian: Đặt thuê → Đã cọc → Nhận máy → Đang thuê → Đã trả máy → Hoàn cọc.
- Chuông thông báo báo khi đơn được xác nhận, đã thu tiền thuê, bắt đầu thuê, đã nhận lại máy (kèm số tiền hoàn), đã hoàn cọc hoặc bị huỷ.
