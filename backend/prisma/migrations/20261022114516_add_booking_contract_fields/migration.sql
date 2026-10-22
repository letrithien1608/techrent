-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "contract_content" TEXT,
ADD COLUMN     "contract_signed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contract_signed_at" TIMESTAMP(3);
