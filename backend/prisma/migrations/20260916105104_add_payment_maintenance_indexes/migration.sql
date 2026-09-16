-- CreateIndex
CREATE INDEX "idx_maintenance_device_status" ON "maintenance"("device_id", "status");

-- CreateIndex
CREATE INDEX "idx_payments_booking_id" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "idx_payments_transaction_id" ON "payments"("transaction_id");
