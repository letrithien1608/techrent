-- AlterTable
ALTER TABLE "devices" ADD COLUMN "is_discontinued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "discontinued_at" TIMESTAMP(3);
