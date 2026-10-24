-- When the refresh token was last swapped; the grace period for a racing tab is measured from here, not from activity.
ALTER TABLE "Session" ADD COLUMN "rotatedAt" TIMESTAMPTZ(3);
