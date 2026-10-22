-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "late_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "blacklist_reason" TEXT,
ADD COLUMN     "blacklisted_at" TIMESTAMP(3),
ADD COLUMN     "is_blacklisted" BOOLEAN NOT NULL DEFAULT false;
