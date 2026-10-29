-- CreateIndex
CREATE INDEX "Notification_userId_channel_createdAt_id_idx" ON "Notification"("userId", "channel", "createdAt" DESC, "id" DESC);
