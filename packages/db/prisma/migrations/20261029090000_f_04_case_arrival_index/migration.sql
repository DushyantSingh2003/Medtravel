-- The ground coordinator scope filters cases by planned arrival.
CREATE INDEX "Case_plannedArrivalAt_idx" ON "Case"("plannedArrivalAt");
