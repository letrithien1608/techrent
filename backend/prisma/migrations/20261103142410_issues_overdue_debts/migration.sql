-- CreateEnum
CREATE TYPE "IssueReportStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "IssueResolution" AS ENUM ('swapped', 'ended_early', 'customer_fault');

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'lost';

-- AlterEnum
ALTER TYPE "DeviceStatus" ADD VALUE 'lost';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "debt_paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lost_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "rental_refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "repair_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "suspected_lost_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "device_issue_reports" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "reported_by_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "media" TEXT[],
    "status" "IssueReportStatus" NOT NULL DEFAULT 'open',
    "resolution" "IssueResolution",
    "resolution_note" TEXT,
    "repair_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "replacement_device_id" TEXT,
    "previous_handover_images" TEXT[],
    "rental_refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_issue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payments" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "RentalPaymentMethod" NOT NULL,
    "note" TEXT,
    "collected_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_issue_reports_status" ON "device_issue_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_issue_reports_booking" ON "device_issue_reports"("booking_id");

-- CreateIndex
CREATE INDEX "idx_debt_payments_user" ON "debt_payments"("user_id");

-- AddForeignKey
ALTER TABLE "device_issue_reports" ADD CONSTRAINT "device_issue_reports_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: đơn dữ liệu mẫu do prisma/seed-reviews.ts tạo (tài khoản demo.review<N>@techrent.test)
-- → loại khỏi mọi thống kê doanh thu/tiền thuê.
UPDATE "bookings" b
SET "is_demo" = true
FROM "users" u
WHERE u."id" = b."user_id" AND u."email" LIKE 'demo.review%@techrent.test';
