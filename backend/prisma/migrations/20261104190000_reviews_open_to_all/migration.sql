-- Đánh giá v2 (04/11): mọi khách đã đăng nhập đều đánh giá được (không cần đã
-- thuê) → booking_id cho phép NULL (giữ cho đánh giá cũ). Thêm xoá mềm bởi
-- quản trị (deleted_*) và bộ đếm sửa theo ngày (edit_day/edit_count).

-- Đánh giá cũ đã có user_id/device_id từ migration 20261024090000_review_rules;
-- chạy lại backfill cho chắc (không đổi gì nếu đã đúng).
UPDATE "reviews" r SET "user_id" = b."user_id", "device_id" = b."device_id"
FROM "bookings" b
WHERE b."id" = r."booking_id"
  AND (r."user_id" IS DISTINCT FROM b."user_id" OR r."device_id" IS DISTINCT FROM b."device_id");

-- Dừng migration (KHÔNG tự xoá) nếu có cặp (user, device) trùng.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "reviews" GROUP BY "user_id", "device_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'reviews có cặp (user_id, device_id) trùng — cần xử lý tay trước khi migrate';
  END IF;
END $$;

ALTER TABLE "reviews" ALTER COLUMN "booking_id" DROP NOT NULL;

ALTER TABLE "reviews" ADD COLUMN "edit_day" TEXT;
ALTER TABLE "reviews" ADD COLUMN "edit_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "reviews" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "reviews" ADD COLUMN "deleted_by_id" TEXT;
ALTER TABLE "reviews" ADD COLUMN "delete_reason" TEXT;

-- Ràng buộc 1 đánh giá/khách/thiết bị đã có (uq_reviews_user_device); tạo lại
-- nếu môi trường nào đó thiếu.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_reviews_user_device" ON "reviews"("user_id", "device_id");

-- Quan hệ booking giờ tuỳ chọn → Prisma mặc định ON DELETE SET NULL.
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_booking_id_fkey";
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
