-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "avg_rating" DOUBLE PRECISION,
ADD COLUMN     "review_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill: tính lại avg_rating/review_count cho các thiết bị ĐÃ có review
-- từ trước khi cột này tồn tại (join reviews -> bookings để lấy device_id).
-- Thiết bị chưa từng có review nào giữ nguyên mặc định (avg_rating = NULL,
-- review_count = 0) — không cần xử lý riêng, ĐÚNG ý nghĩa "chưa có đánh giá".
UPDATE "devices" AS d
SET "avg_rating" = sub.avg_rating,
    "review_count" = sub.review_count
FROM (
  SELECT b."device_id" AS device_id,
         AVG(r."rating")::double precision AS avg_rating,
         COUNT(*)::integer AS review_count
  FROM "reviews" r
  JOIN "bookings" b ON b."id" = r."booking_id"
  GROUP BY b."device_id"
) AS sub
WHERE d."id" = sub.device_id;
