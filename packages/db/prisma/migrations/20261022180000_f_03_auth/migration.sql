-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('user', 'magic_link');

-- CreateEnum
CREATE TYPE "AuthChallengeKind" AS ENUM ('email_verification', 'password_reset', 'login_code', 'invitation', 'magic_link');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceLabel" VARCHAR(120),
ADD COLUMN     "kind" "SessionKind" NOT NULL DEFAULT 'user',
ADD COLUMN     "previousTokenHash" TEXT,
ADD COLUMN     "scopeCaseId" UUID,
ADD COLUMN     "twoFactorVerifiedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMPTZ(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMPTZ(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "AuthChallengeKind" NOT NULL,
    "target" TEXT,
    "tokenHash" TEXT,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    "createdById" UUID,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupCode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,

    CONSTRAINT "BackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_tokenHash_key" ON "AuthChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthChallenge_kind_target_idx" ON "AuthChallenge"("kind", "target");

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_kind_idx" ON "AuthChallenge"("userId", "kind");

-- CreateIndex
CREATE INDEX "AuthChallenge_createdById_idx" ON "AuthChallenge"("createdById");

-- CreateIndex
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "BackupCode_userId_idx" ON "BackupCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_previousTokenHash_key" ON "Session"("previousTokenHash");

-- CreateIndex
CREATE INDEX "Session_scopeCaseId_idx" ON "Session"("scopeCaseId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_scopeCaseId_fkey" FOREIGN KEY ("scopeCaseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackupCode" ADD CONSTRAINT "BackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules Prisma cannot express ----------------------------------------------------------------------------------
ALTER TABLE "User" ADD CONSTRAINT "User_failed_login_check" CHECK ("failedLoginCount" >= 0);

-- A challenge carries a token (links) or a code (typed), and has not been guessed at more than allowed.
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_secret_check"
  CHECK ("tokenHash" IS NOT NULL OR "codeHash" IS NOT NULL);
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_attempts_check" CHECK ("attempts" >= 0);

-- A magic-link session always names its case, and only a magic-link session does.
ALTER TABLE "Session" ADD CONSTRAINT "Session_scope_check"
  CHECK (("kind" = 'magic_link') = ("scopeCaseId" IS NOT NULL));
