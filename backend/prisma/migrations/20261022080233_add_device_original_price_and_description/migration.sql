-- AlterTable: thêm cột mới. `original_price` cần NOT NULL cuối cùng nhưng
-- bảng đã có 45 dòng — thêm NULLABLE trước, backfill bằng ước tính hợp lý
-- (giá thuê/ngày * 15, xem CLAUDE.md), rồi mới ép NOT NULL. `seed.ts` sẽ ghi
-- đè lại giá trị THẬT hợp lý hơn cho từng thiết bị khi chạy lại seed.
ALTER TABLE "devices"
  ADD COLUMN "detailed_description" TEXT,
  ADD COLUMN "original_price" DECIMAL(12,2);

UPDATE "devices"
SET "original_price" = "price_per_day" * 15
WHERE "original_price" IS NULL;

ALTER TABLE "devices"
  ALTER COLUMN "original_price" SET NOT NULL;
