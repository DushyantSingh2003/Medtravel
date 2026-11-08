-- CreateEnum
CREATE TYPE "ChangeRequestKind" AS ENUM ('hospital_onboarding', 'hospital_profile', 'package_price');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

-- AlterTable
ALTER TABLE "Accreditation" ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "verifiedById" UUID;

-- AlterTable
ALTER TABLE "Hospital" ADD COLUMN     "agreementDocumentId" UUID,
ADD COLUMN     "agreementEndsOn" DATE,
ADD COLUMN     "agreementStartsOn" DATE;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PartnerChangeRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "ChangeRequestKind" NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'pending',
    "current" JSONB NOT NULL,
    "proposed" JSONB NOT NULL,
    "note" TEXT,
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "hospitalId" UUID NOT NULL,
    "packageId" UUID,
    "submittedById" UUID,
    "decidedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PartnerChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerChangeRequest_status_createdAt_idx" ON "PartnerChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerChangeRequest_hospitalId_idx" ON "PartnerChangeRequest"("hospitalId");

-- CreateIndex
CREATE INDEX "PartnerChangeRequest_packageId_idx" ON "PartnerChangeRequest"("packageId");

-- CreateIndex
CREATE INDEX "PartnerChangeRequest_submittedById_idx" ON "PartnerChangeRequest"("submittedById");

-- CreateIndex
CREATE INDEX "PartnerChangeRequest_decidedById_idx" ON "PartnerChangeRequest"("decidedById");

-- CreateIndex
CREATE INDEX "Accreditation_verifiedById_idx" ON "Accreditation"("verifiedById");

-- CreateIndex
CREATE INDEX "Hospital_agreementDocumentId_idx" ON "Hospital"("agreementDocumentId");

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_agreementDocumentId_fkey" FOREIGN KEY ("agreementDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accreditation" ADD CONSTRAINT "Accreditation_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerChangeRequest" ADD CONSTRAINT "PartnerChangeRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerChangeRequest" ADD CONSTRAINT "PartnerChangeRequest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerChangeRequest" ADD CONSTRAINT "PartnerChangeRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerChangeRequest" ADD CONSTRAINT "PartnerChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Packages that are on offer today stay visible; new ones start unpublished until an admin publishes them.
UPDATE "Package" SET "published" = "active" WHERE "deletedAt" IS NULL;

ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_agreementBp_check" CHECK ("agreementBp" IS NULL OR "agreementBp" BETWEEN 0 AND 10000);
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_agreement_dates_check" CHECK ("agreementStartsOn" IS NULL OR "agreementEndsOn" IS NULL OR "agreementEndsOn" >= "agreementStartsOn");
