-- AlterTable: thêm cccd_hash (unique, hash 1 chiều để kiểm tra trùng CCCD) và
-- cccd_masked (bản che bớt tính sẵn lúc ghi, tránh phải giải mã mỗi lần hiển thị).
-- cccd_encrypted đã có sẵn từ migration init (Tuần 3), chưa từng dùng tới.
ALTER TABLE "users" ADD COLUMN "cccd_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "cccd_masked" TEXT;

-- CreateIndex: unique cấp database cho cccd_hash — lớp bảo vệ cuối cùng chống
-- race condition (2 request đăng ký cùng lúc với cùng CCCD), không chỉ dựa vào
-- validate ở tầng ứng dụng. Nullable nên nhiều user chưa có CCCD (dữ liệu cũ)
-- không bị coi là trùng nhau.
CREATE UNIQUE INDEX "idx_users_cccd_hash" ON "users"("cccd_hash");

-- CreateIndex: unique cấp database cho phone — cùng lý do như trên.
CREATE UNIQUE INDEX "idx_users_phone" ON "users"("phone");
