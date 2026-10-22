import { z } from 'zod';
import { cursorQuerySchema, localeSchema } from './primitives.js';
import { documentKindSchema } from './enums.js';

/**
 * Master data (PRD 9.1): the reference tables an admin maintains. One resource name per table; the API serves them
 * all under `/masters/:resource` and the admin screens draw their forms from the field metadata below.
 */
export const MASTER_RESOURCES = [
  'countries',
  'languages',
  'currencies',
  'specialities',
  'treatments',
  'cities',
  'document-types',
  'lost-reasons',
] as const;
export const masterResourceSchema = z.enum(MASTER_RESOURCES);
export type MasterResource = z.infer<typeof masterResourceSchema>;

/** Languages a master row can be translated into. English is the row itself. */
export const translationLocaleSchema = localeSchema.exclude(['en']);
export type TranslationLocale = z.infer<typeof translationLocaleSchema>;

// ---- field rules ---------------------------------------------------------------------------------------------
const text = (max: number) => z.string().trim().min(1, 'Required').max(max);
const nameSchema = text(120);
const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Lowercase letters, digits and single hyphens');
const snakeCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/, 'Lowercase letters, digits and underscores, starting with a letter');
const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}$/, 'Two capital letters (ISO 3166-1 alpha-2)');
const languageCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/, 'A language code such as en or pt-BR');
const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'Three capital letters (ISO 4217)');
const dialCodeSchema = z
  .string()
  .trim()
  .regex(/^\+\d{1,4}$/, 'A plus sign and 1 to 4 digits, such as +91');
const uuidSchema = z.string().uuid();

const nameTranslation = z.object({ name: nameSchema });
const treatmentTranslation = z.object({ name: nameSchema, summary: text(2000).nullish() });
const translationsOf = <T extends z.ZodTypeAny>(entry: T) =>
  z.partialRecord(translationLocaleSchema, entry);

// ---- create and update schemas, one pair per resource --------------------------------------------------------
// The shapes carry no defaults: an update built from them must never fill in a field the caller left out. The
// create schemas add the defaults on top (new rows are active, a currency has two decimals, ...).
const countryShape = z.strictObject({
  code: countryCodeSchema,
  name: nameSchema,
  dialCode: dialCodeSchema.nullish(),
  region: text(60).nullish(),
  active: z.boolean(),
  translations: translationsOf(nameTranslation).optional(),
});
const languageShape = z.strictObject({
  code: languageCodeSchema,
  name: nameSchema,
  rtl: z.boolean(),
  active: z.boolean(),
});
const currencyShape = z.strictObject({
  code: currencyCodeSchema,
  name: nameSchema,
  minorUnits: z.number().int().min(0).max(4),
  symbol: text(8).nullish(),
  active: z.boolean(),
});
const specialityShape = z.strictObject({
  slug: slugSchema,
  name: nameSchema,
  active: z.boolean(),
  translations: translationsOf(nameTranslation).optional(),
});
const treatmentShape = z.strictObject({
  slug: slugSchema,
  name: nameSchema,
  summary: text(2000).nullish(),
  typicalStayDays: z.number().int().min(1).max(365).nullish(),
  specialityId: uuidSchema,
  active: z.boolean(),
  translations: translationsOf(treatmentTranslation).optional(),
});
const cityShape = z.strictObject({
  slug: slugSchema,
  name: nameSchema,
  countryCode: countryCodeSchema,
  active: z.boolean(),
  translations: translationsOf(nameTranslation).optional(),
});
const documentTypeShape = z.strictObject({
  code: snakeCodeSchema,
  name: nameSchema,
  kind: documentKindSchema,
  active: z.boolean(),
  translations: translationsOf(nameTranslation).optional(),
});
const lostReasonShape = z.strictObject({
  code: snakeCodeSchema,
  name: nameSchema,
  active: z.boolean(),
  translations: translationsOf(nameTranslation).optional(),
});

const activeByDefault = z.boolean().default(true);

export const countryCreateSchema = countryShape.extend({ active: activeByDefault });
export const languageCreateSchema = languageShape.extend({
  rtl: z.boolean().default(false),
  active: activeByDefault,
});
export const currencyCreateSchema = currencyShape.extend({
  minorUnits: z.number().int().min(0).max(4).default(2),
  active: activeByDefault,
});
export const specialityCreateSchema = specialityShape.extend({ active: activeByDefault });
export const treatmentCreateSchema = treatmentShape.extend({ active: activeByDefault });
export const cityCreateSchema = cityShape.extend({ active: activeByDefault });
export const documentTypeCreateSchema = documentTypeShape.extend({ active: activeByDefault });
export const lostReasonCreateSchema = lostReasonShape.extend({ active: activeByDefault });

/** Codes are the identity of a row and never change; every other field may be sent on its own. */
const codeIsImmutable = { code: true } as const;

export const MASTER_CREATE_SCHEMAS = {
  countries: countryCreateSchema,
  languages: languageCreateSchema,
  currencies: currencyCreateSchema,
  specialities: specialityCreateSchema,
  treatments: treatmentCreateSchema,
  cities: cityCreateSchema,
  'document-types': documentTypeCreateSchema,
  'lost-reasons': lostReasonCreateSchema,
} as const satisfies Record<MasterResource, z.ZodType>;

export const MASTER_UPDATE_SCHEMAS = {
  countries: countryShape.omit(codeIsImmutable).partial(),
  languages: languageShape.omit(codeIsImmutable).partial(),
  currencies: currencyShape.omit(codeIsImmutable).partial(),
  specialities: specialityShape.partial(),
  treatments: treatmentShape.partial(),
  cities: cityShape.partial(),
  'document-types': documentTypeShape.omit(codeIsImmutable).partial(),
  'lost-reasons': lostReasonShape.omit(codeIsImmutable).partial(),
} as const satisfies Record<MasterResource, z.ZodType>;

// ---- list query and row ---------------------------------------------------------------------------------------
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Query of `GET /masters/:resource`. Filters that do not apply to a resource are ignored. */
export const masterListQuerySchema = cursorQuerySchema.extend({
  /** Matches the name, slug or code, and the translated names. */
  q: z.string().trim().min(1).max(100).optional(),
  active: booleanQuery.optional(),
  /** Show only soft-deleted rows. */
  deleted: booleanQuery.optional(),
  /** A field name, prefixed with `-` for descending. Which fields are allowed depends on the resource. */
  sort: z
    .string()
    .regex(/^-?[a-zA-Z]{2,20}$/)
    .optional(),
  specialityId: uuidSchema.optional(),
  countryCode: countryCodeSchema.optional(),
  kind: documentKindSchema.optional(),
});
export type MasterListQuery = z.infer<typeof masterListQuerySchema>;

/**
 * One master row as the API returns it. The fields common to all tables come first; the rest appear only on the
 * tables that have them. `id` is the key to use in URLs: the ISO code for countries, languages and currencies, a
 * UUID for the others.
 */
export const masterRowSchema = z.object({
  id: z.string(),
  code: z.string().optional(),
  slug: z.string().optional(),
  name: z.string(),
  active: z.boolean(),
  deletedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime().nullable(),
  translations: z.record(z.string(), z.object({ name: z.string(), summary: z.string().nullish() })),
  dialCode: z.string().nullish(),
  region: z.string().nullish(),
  rtl: z.boolean().optional(),
  minorUnits: z.number().int().optional(),
  symbol: z.string().nullish(),
  summary: z.string().nullish(),
  typicalStayDays: z.number().int().nullish(),
  specialityId: z.string().optional(),
  speciality: z.object({ id: z.string(), name: z.string() }).optional(),
  countryCode: z.string().optional(),
  kind: documentKindSchema.optional(),
});
export type MasterRow = z.infer<typeof masterRowSchema>;

// ---- what the admin screens need to know about each table -----------------------------------------------------
export type MasterFieldType =
  'text' | 'textarea' | 'number' | 'boolean' | 'speciality' | 'country' | 'documentKind';

export interface MasterField {
  name: string;
  type: MasterFieldType;
  /** Only editable when creating: the identity of the row. */
  createOnly?: boolean;
}

export interface MasterDefinition {
  resource: MasterResource;
  /** `code`: the primary key is the ISO code. `uuid`: generated. */
  keyKind: 'code' | 'uuid';
  /** Rows can be soft-deleted and restored; otherwise they can only be deactivated. */
  softDelete: boolean;
  /** Fields (besides `name`) that have a translated variant. */
  translatedFields: readonly string[];
  fields: readonly MasterField[];
  /** Fields the list may be sorted by (`name` and `createdAt` are always allowed). */
  sortFields: readonly string[];
}

export const MASTER_DEFINITIONS = {
  countries: {
    resource: 'countries',
    keyKind: 'code',
    softDelete: false,
    translatedFields: [],
    sortFields: ['name', 'code', 'createdAt'],
    fields: [
      { name: 'code', type: 'text', createOnly: true },
      { name: 'name', type: 'text' },
      { name: 'dialCode', type: 'text' },
      { name: 'region', type: 'text' },
    ],
  },
  languages: {
    resource: 'languages',
    keyKind: 'code',
    softDelete: false,
    translatedFields: [],
    sortFields: ['name', 'code'],
    fields: [
      { name: 'code', type: 'text', createOnly: true },
      { name: 'name', type: 'text' },
      { name: 'rtl', type: 'boolean' },
    ],
  },
  currencies: {
    resource: 'currencies',
    keyKind: 'code',
    softDelete: false,
    translatedFields: [],
    sortFields: ['name', 'code'],
    fields: [
      { name: 'code', type: 'text', createOnly: true },
      { name: 'name', type: 'text' },
      { name: 'minorUnits', type: 'number' },
      { name: 'symbol', type: 'text' },
    ],
  },
  specialities: {
    resource: 'specialities',
    keyKind: 'uuid',
    softDelete: true,
    translatedFields: [],
    sortFields: ['name', 'slug', 'createdAt'],
    fields: [
      { name: 'slug', type: 'text' },
      { name: 'name', type: 'text' },
    ],
  },
  treatments: {
    resource: 'treatments',
    keyKind: 'uuid',
    softDelete: true,
    translatedFields: ['summary'],
    sortFields: ['name', 'slug', 'createdAt', 'typicalStayDays'],
    fields: [
      { name: 'slug', type: 'text' },
      { name: 'name', type: 'text' },
      { name: 'specialityId', type: 'speciality' },
      { name: 'summary', type: 'textarea' },
      { name: 'typicalStayDays', type: 'number' },
    ],
  },
  cities: {
    resource: 'cities',
    keyKind: 'uuid',
    softDelete: true,
    translatedFields: [],
    sortFields: ['name', 'slug', 'createdAt'],
    fields: [
      { name: 'slug', type: 'text' },
      { name: 'name', type: 'text' },
      { name: 'countryCode', type: 'country' },
    ],
  },
  'document-types': {
    resource: 'document-types',
    keyKind: 'uuid',
    softDelete: true,
    translatedFields: [],
    sortFields: ['name', 'code', 'kind', 'createdAt'],
    fields: [
      { name: 'code', type: 'text', createOnly: true },
      { name: 'name', type: 'text' },
      { name: 'kind', type: 'documentKind' },
    ],
  },
  'lost-reasons': {
    resource: 'lost-reasons',
    keyKind: 'uuid',
    softDelete: true,
    translatedFields: [],
    sortFields: ['name', 'code', 'createdAt'],
    fields: [
      { name: 'code', type: 'text', createOnly: true },
      { name: 'name', type: 'text' },
    ],
  },
} as const satisfies Record<MasterResource, MasterDefinition>;
