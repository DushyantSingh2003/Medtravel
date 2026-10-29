-- F-06 secure file service: the upload intent table and the scan and processing results on Document.

-- CreateEnum
CREATE TYPE "FileUploadStatus" AS ENUM ('open', 'completed', 'aborted', 'expired');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "scanDetail" VARCHAR(200),
ADD COLUMN     "scannedAt" TIMESTAMPTZ(3),
ADD COLUMN     "thumbnailKey" TEXT;

-- CreateTable
CREATE TABLE "FileUpload" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "uploadId" TEXT,
    "status" "FileUploadStatus" NOT NULL DEFAULT 'open',
    "fileName" TEXT NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'other',
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'private',
    "typeId" UUID,
    "caseId" UUID,
    "patientId" UUID,
    "hospitalId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "documentId" UUID,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileUpload_key_key" ON "FileUpload"("key");

-- CreateIndex
CREATE UNIQUE INDEX "FileUpload_documentId_key" ON "FileUpload"("documentId");

-- CreateIndex
CREATE INDEX "FileUpload_userId_status_idx" ON "FileUpload"("userId", "status");

-- CreateIndex
CREATE INDEX "FileUpload_status_expiresAt_idx" ON "FileUpload"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- An upload is between 1 byte and 500 MiB (PRD file service) and belongs to a case, a patient file or a hospital.
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_size_check" CHECK ("sizeBytes" BETWEEN 1 AND 524288000);
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_owner_check"
  CHECK ("caseId" IS NOT NULL OR "patientId" IS NOT NULL OR "hospitalId" IS NOT NULL);
ALTER TABLE "Document" ADD CONSTRAINT "Document_page_count_check" CHECK ("pageCount" IS NULL OR "pageCount" >= 1);
