-- Cơ chế 3 (lớp bảo vệ cuối cùng ở tầng DB) — xem mục 5 TechRent-Roadmap.md
-- Ngăn 2 booking overlap cho cùng 1 thiết bị ở tầng database, kể cả khi
-- transaction + SELECT ... FOR UPDATE ở tầng ứng dụng bị bỏ qua vì lý do nào đó.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  device_id WITH =,
  tsrange(start_time, end_time) WITH &&
) WHERE (status IN ('pending', 'confirmed', 'ongoing'));
