-- CreateIndex
CREATE INDEX "idx_notifications_user_id_created_at" ON "notifications"("user_id", "created_at");
