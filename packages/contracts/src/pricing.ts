import { z } from 'zod';
import { quoteLineKindSchema } from './enums.js';
import { multiply, type Money } from './money.js';
import { type Role } from './roles.js';

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Three capital letters (ISO 4217)');
const minor = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const basisPoints = (max: number) => z.number().int().min(0).max(max);

/** Prices are kept in this currency first; any other currency without its own price is converted from it. */
export const PRICING_BASE_CURRENCY = 'INR';

/** The three service packages we sell, cheapest first. */
export const SERVICE_PACKAGE_CODES = ['basic', 'standard', 'premium'] as const;

export const priceItemKindSchema = z.enum(['service_package', 'add_on']);
export type PriceItemKind = z.infer<typeof priceItemKindSchema>;

export const priceSchema = z.object({ currency: currencyCode, amountMinor: minor });
export type Price = z.infer<typeof priceSchema>;

export const priceVersionSchema = z.object({
  id: z.uuid(),
  version: z.number().int().min(1),
  note: z.string().max(500).nullable(),
  createdAt: z.iso.datetime(),
  createdByName: z.string().max(200).nullable(),
  prices: z.array(priceSchema),
});
export type PriceVersion = z.infer<typeof priceVersionSchema>;

export const priceItemSchema = z.object({
  id: z.uuid(),
  kind: priceItemKindSchema,
  code: z.string().max(60),
  name: z.string().max(120),
  unit: z.string().max(30).nullable(),
  inclusions: z.array(z.string().max(200)),
  sortOrder: z.number().int(),
  active: z.boolean(),
  /** The version quotes are priced from today; null when no price has been set yet. */
  current: priceVersionSchema.nullable(),
});
export type PriceItem = z.infer<typeof priceItemSchema>;

export const priceItemListSchema = z.object({ items: z.array(priceItemSchema) });
export type PriceItemList = z.infer<typeof priceItemListSchema>;

export const priceHistorySchema = z.object({ versions: z.array(priceVersionSchema) });
export type PriceHistory = z.infer<typeof priceHistorySchema>;

const code = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{1,59}$/, 'Lower-case letters, digits and underscores');
const inclusions = z.array(z.string().trim().min(1).max(200)).max(30);

export const createAddOnSchema = z.object({
  code,
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(30),
  inclusions: inclusions.default([]),
});
export type CreateAddOn = z.infer<typeof createAddOnSchema>;

export const updatePriceItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    unit: z.string().trim().min(1).max(30),
    inclusions,
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');
export type UpdatePriceItem = z.infer<typeof updatePriceItemSchema>;

/** Publishes a new version: the full set of prices, which must include the base currency. */
export const publishPriceSchema = z
  .object({
    prices: z.array(priceSchema).min(1).max(40),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.prices.forEach((price, index) => {
      if (seen.has(price.currency))
        ctx.addIssue({
          code: 'custom',
          path: ['prices', index, 'currency'],
          message: 'Each currency once',
        });
      seen.add(price.currency);
    });
    if (!seen.has(PRICING_BASE_CURRENCY))
      ctx.addIssue({
        code: 'custom',
        path: ['prices'],
        message: `Include the ${PRICING_BASE_CURRENCY} price: other currencies are converted from it`,
      });
  });
export type PublishPrice = z.infer<typeof publishPriceSchema>;

export const priceLookupQuerySchema = z.object({ currency: currencyCode });
export type PriceLookupQuery = z.infer<typeof priceLookupQuerySchema>;

/** What the quote builder copies into a quote line: the price, the version it came from and, when converted, the rate used. */
export const priceLookupSchema = z.object({
  code: z.string(),
  name: z.string(),
  currency: currencyCode,
  unitPriceMinor: minor,
  version: z.number().int().min(1),
  versionId: z.uuid(),
  converted: z.boolean(),
  fx: z
    .object({
      from: currencyCode,
      rate: z.string().max(40),
      asOf: z.iso.datetime(),
      source: z.string().max(80),
      markupBp: z.number().int(),
    })
    .nullable(),
});
export type PriceLookup = z.infer<typeof priceLookupSchema>;

// ---- margins and discounts --------------------------------------------------------------------------------------
export const marginRuleSchema = z.object({
  component: quoteLineKindSchema,
  marginBp: basisPoints(100_000),
});
export type MarginRule = z.infer<typeof marginRuleSchema>;

export const marginRulesSchema = z.object({ rules: z.array(marginRuleSchema) });
export type MarginRules = z.infer<typeof marginRulesSchema>;

/** Every component once; the discount line is not marked up. */
export const updateMarginRulesSchema = z.object({
  rules: z
    .array(marginRuleSchema)
    .min(1)
    .superRefine((rules, ctx) => {
      const seen = new Set<string>();
      rules.forEach((rule, index) => {
        if (seen.has(rule.component))
          ctx.addIssue({ code: 'custom', path: [index, 'component'], message: 'Each component once' });
        seen.add(rule.component);
      });
    }),
});
export type UpdateMarginRules = z.infer<typeof updateMarginRulesSchema>;

/** Roles that can give a discount on a quote. */
export const DISCOUNT_ROLES = ['case_manager', 'finance', 'super_admin'] as const satisfies readonly Role[];
export const discountThresholdSchema = z.object({
  role: z.enum(DISCOUNT_ROLES),
  maxBp: basisPoints(10_000),
});
export type DiscountThreshold = z.infer<typeof discountThresholdSchema>;
export const discountThresholdsSchema = z.object({ thresholds: z.array(discountThresholdSchema) });
export type DiscountThresholds = z.infer<typeof discountThresholdsSchema>;
export const updateDiscountThresholdsSchema = z.object({
  thresholds: z
    .array(discountThresholdSchema)
    .min(1)
    .superRefine((rows, ctx) => {
      const seen = new Set<string>();
      rows.forEach((row, index) => {
        if (seen.has(row.role))
          ctx.addIssue({ code: 'custom', path: [index, 'role'], message: 'Each role once' });
        seen.add(row.role);
      });
    }),
});
export type UpdateDiscountThresholds = z.infer<typeof updateDiscountThresholdsSchema>;

/** The price with our margin on top of cost, rounded to a whole minor unit. */
export function applyMargin(cost: Money, marginBp: number): Money {
  return multiply(cost, { n: BigInt(10_000 + marginBp), d: 10_000n });
}

/** The discount in basis points of the undiscounted total (0 when there is none). */
export function discountBp(beforeDiscount: Money, discount: Money): number {
  if (beforeDiscount.currency !== discount.currency)
    throw new Error('Compare amounts in one currency');
  if (beforeDiscount.amountMinor <= 0 || discount.amountMinor <= 0) return 0;
  return Math.ceil((discount.amountMinor * 10_000) / beforeDiscount.amountMinor);
}

/**
 * Whether a person in `role` may give a discount of `bp` on their own. Roles with no threshold may not discount at all; a
 * discount above the role's limit needs approval from a role with a higher limit.
 */
export function discountDecision(
  thresholds: readonly DiscountThreshold[],
  role: Role,
  bp: number,
): { allowed: boolean; limitBp: number | null; approverRole: Role | null } {
  const limit = thresholds.find((row) => row.role === role)?.maxBp ?? null;
  if (limit !== null && bp <= limit) return { allowed: true, limitBp: limit, approverRole: null };
  const approver = [...thresholds]
    .filter((row) => row.maxBp >= bp && row.role !== role)
    .sort((a, b) => a.maxBp - b.maxBp)[0];
  return { allowed: false, limitBp: limit, approverRole: approver?.role ?? null };
}

// ---- exchange-rate settings ---------------------------------------------------------------------------------------
export const FX_PROVIDERS = ['static', 'frankfurter', 'openexchangerates'] as const;
export const fxProviderSchema = z.enum(FX_PROVIDERS);

export const fxSettingsSchema = z.object({
  /** The provider chosen here; null means the one the environment is configured with. */
  provider: fxProviderSchema.nullable(),
  markupBp: basisPoints(5_000),
  updatedAt: z.iso.datetime().nullable(),
  updatedByName: z.string().max(200).nullable(),
});
export type FxSettings = z.infer<typeof fxSettingsSchema>;

export const updateFxSettingsSchema = z.object({
  provider: fxProviderSchema.nullable(),
  markupBp: basisPoints(5_000),
});
export type UpdateFxSettings = z.infer<typeof updateFxSettingsSchema>;

export const fxOverrideSchema = z.object({
  id: z.uuid(),
  base: currencyCode,
  quote: currencyCode,
  rate: z.string().max(40),
  reason: z.string().max(500),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  createdByName: z.string().max(200).nullable(),
});
export type FxOverrideView = z.infer<typeof fxOverrideSchema>;
export const fxOverrideListSchema = z.object({ items: z.array(fxOverrideSchema) });
export type FxOverrideList = z.infer<typeof fxOverrideListSchema>;

export const createFxOverrideSchema = z
  .object({
    base: currencyCode,
    quote: currencyCode,
    rate: z.string().trim().regex(/^\d{1,10}(\.\d{1,8})?$/, 'A positive number with up to 8 decimals'),
    reason: z.string().trim().min(5).max(500),
    expiresAt: z.iso.datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.base === value.quote)
      ctx.addIssue({ code: 'custom', path: ['quote'], message: 'Choose two different currencies' });
    if (!/[1-9]/.test(value.rate))
      ctx.addIssue({ code: 'custom', path: ['rate'], message: 'The rate must be above zero' });
  });
export type CreateFxOverride = z.infer<typeof createFxOverrideSchema>;


