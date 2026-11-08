import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  createAddOnSchema,
  createFxOverrideSchema,
  discountThresholdsSchema,
  fxOverrideListSchema,
  fxOverrideSchema,
  fxSettingsSchema,
  marginRulesSchema,
  priceHistorySchema,
  priceItemKindSchema,
  priceItemListSchema,
  priceItemSchema,
  priceLookupQuerySchema,
  priceLookupSchema,
  publishPriceSchema,
  updateDiscountThresholdsSchema,
  updateFxSettingsSchema,
  updateMarginRulesSchema,
  updatePriceItemSchema,
} from '@medtravel/contracts';

export class ItemCodeParamDto extends createZodDto(z.object({ code: z.string().min(2).max(60) })) {}
export class OverrideIdParamDto extends createZodDto(z.object({ id: z.uuid() })) {}
export class PriceItemListQueryDto extends createZodDto(
  z.object({ kind: priceItemKindSchema.optional() }),
) {}
export class PriceItemListDto extends createZodDto(priceItemListSchema) {}
export class PriceItemDto extends createZodDto(priceItemSchema) {}
export class CreateAddOnDto extends createZodDto(createAddOnSchema) {}
export class UpdatePriceItemDto extends createZodDto(updatePriceItemSchema) {}
export class PublishPriceDto extends createZodDto(publishPriceSchema) {}
export class PriceHistoryDto extends createZodDto(priceHistorySchema) {}
export class PriceLookupQueryDto extends createZodDto(priceLookupQuerySchema) {}
export class PriceLookupDto extends createZodDto(priceLookupSchema) {}
export class MarginRulesDto extends createZodDto(marginRulesSchema) {}
export class UpdateMarginRulesDto extends createZodDto(updateMarginRulesSchema) {}
export class DiscountThresholdsDto extends createZodDto(discountThresholdsSchema) {}
export class UpdateDiscountThresholdsDto extends createZodDto(updateDiscountThresholdsSchema) {}
export class FxSettingsDto extends createZodDto(fxSettingsSchema) {}
export class UpdateFxSettingsDto extends createZodDto(updateFxSettingsSchema) {}
export class FxOverrideDto extends createZodDto(fxOverrideSchema) {}
export class FxOverrideListDto extends createZodDto(fxOverrideListSchema) {}
export class CreateFxOverrideDto extends createZodDto(createFxOverrideSchema) {}
