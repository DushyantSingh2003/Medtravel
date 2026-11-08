-- The exchange-rate provider is one of three known names, not free text.
CREATE TYPE "FxProvider" AS ENUM ('static', 'frankfurter', 'openexchangerates');

ALTER TABLE "FxSetting" ALTER COLUMN "provider" TYPE "FxProvider" USING "provider"::"FxProvider";

-- Price list entries are business records, so they are retired rather than deleted.
ALTER TABLE "PriceItem" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
