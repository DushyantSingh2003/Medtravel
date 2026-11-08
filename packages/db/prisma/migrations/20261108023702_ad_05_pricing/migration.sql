-- CreateEnum
CREATE TYPE "PriceItemKind" AS ENUM ('service_package', 'add_on');

-- CreateTable
CREATE TABLE "PriceItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "PriceItemKind" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "inclusions" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PriceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceItemVersion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "version" INTEGER NOT NULL,
    "note" TEXT,
    "itemId" UUID NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceItemVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceItemPrice" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "amountMinor" BIGINT NOT NULL,
    "versionId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,

    CONSTRAINT "PriceItemPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarginRule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "component" "QuoteLineKind" NOT NULL,
    "marginBp" INTEGER NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarginRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountThreshold" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "Role" NOT NULL,
    "maxBp" INTEGER NOT NULL,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DiscountThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxSetting" (
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "markupBp" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FxSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxOverride" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rate" DECIMAL(18,8) NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "baseCurrency" CHAR(3) NOT NULL,
    "quoteCurrency" CHAR(3) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceItem_code_key" ON "PriceItem"("code");

-- CreateIndex
CREATE INDEX "PriceItem_kind_sortOrder_idx" ON "PriceItem"("kind", "sortOrder");

-- CreateIndex
CREATE INDEX "PriceItemVersion_createdById_idx" ON "PriceItemVersion"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PriceItemVersion_itemId_version_key" ON "PriceItemVersion"("itemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PriceItemPrice_versionId_currency_key" ON "PriceItemPrice"("versionId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "MarginRule_component_key" ON "MarginRule"("component");

-- CreateIndex
CREATE INDEX "MarginRule_updatedById_idx" ON "MarginRule"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountThreshold_role_key" ON "DiscountThreshold"("role");

-- CreateIndex
CREATE INDEX "DiscountThreshold_updatedById_idx" ON "DiscountThreshold"("updatedById");

-- CreateIndex
CREATE INDEX "FxSetting_updatedById_idx" ON "FxSetting"("updatedById");

-- CreateIndex
CREATE INDEX "FxOverride_baseCurrency_quoteCurrency_idx" ON "FxOverride"("baseCurrency", "quoteCurrency");

-- CreateIndex
CREATE INDEX "FxOverride_createdById_idx" ON "FxOverride"("createdById");

-- AddForeignKey
ALTER TABLE "PriceItemVersion" ADD CONSTRAINT "PriceItemVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "PriceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceItemVersion" ADD CONSTRAINT "PriceItemVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceItemPrice" ADD CONSTRAINT "PriceItemPrice_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PriceItemVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceItemPrice" ADD CONSTRAINT "PriceItemPrice_currency_fkey" FOREIGN KEY ("currency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarginRule" ADD CONSTRAINT "MarginRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountThreshold" ADD CONSTRAINT "DiscountThreshold_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxSetting" ADD CONSTRAINT "FxSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxOverride" ADD CONSTRAINT "FxOverride_baseCurrency_fkey" FOREIGN KEY ("baseCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxOverride" ADD CONSTRAINT "FxOverride_quoteCurrency_fkey" FOREIGN KEY ("quoteCurrency") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FxOverride" ADD CONSTRAINT "FxOverride_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
