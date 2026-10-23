-- Đánh giá thiết bị thật: gắn thẳng user/thiết bị, mỗi khách 1 đánh giá/thiết bị,
-- sửa (edited_at) và ẩn bởi quản trị (is_hidden + lý do).
ALTER TABLE "reviews" ADD COLUMN "user_id" TEXT;
ALTER TABLE "reviews" ADD COLUMN "device_id" TEXT;
ALTER TABLE "reviews" ADD COLUMN "edited_at" TIMESTAMP(3);
ALTER TABLE "reviews" ADD COLUMN "is_hidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reviews" ADD COLUMN "hidden_reason" TEXT;
ALTER TABLE "reviews" ADD COLUMN "hidden_at" TIMESTAMP(3);
ALTER TABLE "reviews" ADD COLUMN "hidden_by_id" TEXT;

-- Backfill từ đơn thuê đã gắn với đánh giá.
UPDATE "reviews" r SET "user_id" = b."user_id", "device_id" = b."device_id"
FROM "bookings" b WHERE b."id" = r."booking_id";

-- Nếu 1 khách lỡ có nhiều đánh giá cho cùng thiết bị (luật cũ theo từng đơn), giữ bản mới nhất.
DELETE FROM "reviews" r USING "reviews" newer
WHERE r."user_id" = newer."user_id" AND r."device_id" = newer."device_id"
  AND (r."created_at", r."id") < (newer."created_at", newer."id");

ALTER TABLE "reviews" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "device_id" SET NOT NULL;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "uq_reviews_user_device" ON "reviews"("user_id", "device_id");
CREATE INDEX "idx_reviews_device_visible" ON "reviews"("device_id", "is_hidden", "created_at");
