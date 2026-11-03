-- CreateIndex
CREATE INDEX "AuditEvent_onBehalfOfId_createdAt_idx" ON "AuditEvent"("onBehalfOfId", "createdAt");
