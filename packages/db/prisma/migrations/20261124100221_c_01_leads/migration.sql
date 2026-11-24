-- CreateEnum
CREATE TYPE "DuplicateState" AS ENUM ('none', 'possible', 'dismissed', 'merged');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "mergedAt" TIMESTAMPTZ(3),
ADD COLUMN     "mergedIntoId" UUID;

-- CreateTable
CREATE TABLE "Lead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" "CaseSource" NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referrer" TEXT,
    "agentCode" TEXT,
    "language" VARCHAR(8),
    "message" TEXT,
    "submittedName" TEXT NOT NULL,
    "submittedEmail" TEXT,
    "submittedPhone" VARCHAR(20),
    "submittedPassport" VARCHAR(32),
    "matchedOn" TEXT[],
    "duplicateState" "DuplicateState" NOT NULL DEFAULT 'none',
    "duplicateOfPatientId" UUID,
    "patientId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_caseId_key" ON "Lead"("caseId");

-- CreateIndex
CREATE INDEX "Lead_duplicateState_createdAt_idx" ON "Lead"("duplicateState", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_patientId_idx" ON "Lead"("patientId");

-- CreateIndex
CREATE INDEX "Lead_duplicateOfPatientId_idx" ON "Lead"("duplicateOfPatientId");

-- CreateIndex
CREATE INDEX "Lead_createdById_idx" ON "Lead"("createdById");

-- CreateIndex
CREATE INDEX "Lead_source_createdAt_idx" ON "Lead"("source", "createdAt");

-- CreateIndex
CREATE INDEX "Patient_mergedIntoId_idx" ON "Patient"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_duplicateOfPatientId_fkey" FOREIGN KEY ("duplicateOfPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Duplicate matching compares phone numbers by their digits and passports by their letters and digits, so spacing, dashes, a
-- leading plus and capital letters never hide a match. Expression indexes keep those lookups fast without a second column to keep in step.
CREATE INDEX "Patient_phone_digits_idx" ON "Patient" ((regexp_replace("phone", '[^0-9]', '', 'g')));
CREATE INDEX "Patient_passport_key_idx" ON "Patient" ((upper(regexp_replace("passportNumber", '[^A-Za-z0-9]', '', 'g'))));

-- A patient merged into another is a soft-deleted shell that points at the survivor, and never at itself.
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_merge_check" CHECK ("mergedIntoId" IS NULL OR "mergedIntoId" <> "id");
