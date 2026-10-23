-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "title" TEXT,
ADD COLUMN "link" TEXT,
ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}';

-- Backfill tiêu đề cho thông báo cũ (trước khi có cột title) theo đúng type.
UPDATE "notifications" SET "title" = CASE "type"
  WHEN 'booking_pending' THEN 'Đơn thuê mới chờ xác nhận'
  WHEN 'booking_confirmed' THEN 'Đơn thuê đã được xác nhận'
  WHEN 'booking_ongoing' THEN 'Đã nhận thiết bị'
  WHEN 'booking_cancelled' THEN 'Đơn thuê đã bị huỷ'
  WHEN 'maintenance_reported' THEN 'Thiết bị được báo hỏng'
  ELSE 'Thông báo'
END
WHERE "title" IS NULL;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "confirmed_by_id" TEXT,
ADD COLUMN "cancelled_by_id" TEXT,
ADD COLUMN "cancellation_reason" TEXT;
