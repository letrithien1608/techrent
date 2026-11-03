-- CreateEnum
CREATE TYPE "RentalPaymentMethod" AS ENUM ('cash', 'bank_transfer');

-- CreateEnum
CREATE TYPE "DepositRefundStatus" AS ENUM ('none', 'pending', 'refunded', 'not_refunded');

-- CreateEnum
CREATE TYPE "InspectionType" AS ENUM ('handover', 'return');

-- CreateEnum
CREATE TYPE "DeviceCondition" AS ENUM ('intact', 'damaged', 'missing_accessories');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "amount_owed" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "damage_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deposit_refund_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deposit_refund_due_at" TIMESTAMP(3),
ADD COLUMN     "deposit_refund_status" "DepositRefundStatus" NOT NULL DEFAULT 'none',
ADD COLUMN     "deposit_refund_txn_ref" TEXT,
ADD COLUMN     "deposit_refunded_at" TIMESTAMP(3),
ADD COLUMN     "deposit_refunded_by_id" TEXT,
ADD COLUMN     "rental_collected_by_id" TEXT,
ADD COLUMN     "rental_paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rental_paid_at" TIMESTAMP(3),
ADD COLUMN     "rental_payment_method" "RentalPaymentMethod",
ADD COLUMN     "returned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "booking_inspections" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "type" "InspectionType" NOT NULL,
    "images" TEXT[],
    "notes" TEXT,
    "condition" "DeviceCondition" NOT NULL DEFAULT 'intact',
    "damage_description" TEXT,
    "performed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_inspections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_booking_inspections_booking_type" ON "booking_inspections"("booking_id", "type");

-- CreateIndex
CREATE INDEX "idx_bookings_deposit_refund" ON "bookings"("deposit_refund_status", "deposit_refund_due_at");

-- AddForeignKey
ALTER TABLE "booking_inspections" ADD CONSTRAINT "booking_inspections_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
