-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "slaBreachedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "assigneeRole" "Role";

-- CreateTable
CREATE TABLE "StageConfig" (
    "stage" "CaseStage" NOT NULL,
    "targetMinutes" INTEGER,
    "ownerRole" "Role" NOT NULL,
    "autoTasks" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "StageConfig_pkey" PRIMARY KEY ("stage")
);
