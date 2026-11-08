-- Money is never negative, rates are positive, and the settings row is the single one called "default".
ALTER TABLE "PriceItemPrice" ADD CONSTRAINT "PriceItemPrice_amount_check" CHECK ("amountMinor" >= 0);
ALTER TABLE "PriceItemVersion" ADD CONSTRAINT "PriceItemVersion_version_check" CHECK ("version" >= 1);
ALTER TABLE "MarginRule" ADD CONSTRAINT "MarginRule_marginBp_check" CHECK ("marginBp" BETWEEN 0 AND 100000);
ALTER TABLE "DiscountThreshold" ADD CONSTRAINT "DiscountThreshold_maxBp_check" CHECK ("maxBp" BETWEEN 0 AND 10000);
ALTER TABLE "FxSetting" ADD CONSTRAINT "FxSetting_markupBp_check" CHECK ("markupBp" BETWEEN 0 AND 5000);
ALTER TABLE "FxSetting" ADD CONSTRAINT "FxSetting_single_row_check" CHECK ("id" = 'default');
ALTER TABLE "FxOverride" ADD CONSTRAINT "FxOverride_rate_check" CHECK ("rate" > 0);
ALTER TABLE "FxOverride" ADD CONSTRAINT "FxOverride_pair_check" CHECK ("baseCurrency" <> "quoteCurrency");
