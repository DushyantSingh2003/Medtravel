-- A notification can carry a key that makes a repeated delivery of the same event a no-op (the worker's handlers are
-- idempotent through it).
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- Audit rows can be deleted only by the retention job, which says so for its own transaction with
-- SET LOCAL medtravel.audit_retention = 'on'. A stray DELETE (a bug, an injected statement) is refused.
CREATE FUNCTION audit_event_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('medtravel.audit_retention', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'AuditEvent rows are deleted only by the retention job';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "AuditEvent_retention_only_delete" BEFORE DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION audit_event_reject_delete();
