-- Backfill cho đơn tạo TRƯỚC quy trình thu tiền thuê/biên bản/hoàn cọc (03/11).
-- 1) Trước đây complete() cộng phí trễ hạn vào total_price. Từ giờ total_price
--    chỉ là tiền thuê, phí trễ hạn trừ vào cọc → tách lại cho đơn cũ.
UPDATE "bookings"
SET "total_price" = "total_price" - "late_fee_amount"
WHERE "late_fee_amount" > 0;

-- 2) Đơn cũ đã giao máy (ongoing/completed) coi như đã thu tiền thuê theo quy
--    trình cũ — không ghi được hình thức/người thu nên để NULL.
UPDATE "bookings"
SET "rental_paid" = true,
    "rental_paid_at" = "start_time"
WHERE "status" IN ('ongoing', 'completed') AND "rental_paid" = false;

-- 3) Đơn cũ đã hoàn tất: ghi nhận thời điểm trả máy = hạn trả (không có số liệu
--    thật). Trạng thái hoàn cọc giữ 'none' — quy trình cũ không theo dõi khoản này.
UPDATE "bookings"
SET "returned_at" = "end_time"
WHERE "status" = 'completed' AND "returned_at" IS NULL;
