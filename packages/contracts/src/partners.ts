import { z } from 'zod';
import { accreditationBodySchema, hospitalStatusSchema } from './enums.js';
import { cursorPageSchema } from './primitives.js';

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable();

export const changeRequestKindSchema = z.enum(['hospital_onboarding', 'hospital_profile', 'package_price']);
export type ChangeRequestKind = z.infer<typeof changeRequestKindSchema>;
export const changeRequestStatusSchema = z.enum(['pending', 'approved', 'rejected', 'withdrawn']);
export type ChangeRequestStatus = z.infer<typeof changeRequestStatusSchema>;

/** The hospital fields a partner may change through a request. Everything else (status, referral fee, agreement) is ours. */
export const PROFILE_FIELDS = [
  'name',
  'description',
  'address',
  'website',
  'phone',
  'email',
  'internationalDeskName',
  'internationalDeskEmail',
  'internationalDeskPhone',
  'bedCount',
  'establishedYear',
] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

export const hospitalProfileFieldsSchema = z
  .object({
    name: text(160).min(2),
    description: optionalText(5000),
    address: optionalText(500),
    website: z.url().max(300).nullable(),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^\+\d{6,15}$/, 'International format such as +911234567890')
      .nullable(),
    email: z.email().max(254).nullable(),
    internationalDeskName: optionalText(120),
    internationalDeskEmail: z.email().max(254).nullable(),
    internationalDeskPhone: z
      .string()
      .trim()
      .max(20)
      .regex(/^\+\d{6,15}$/, 'International format such as +911234567890')
      .nullable(),
    bedCount: z.number().int().min(0).max(20_000).nullable(),
    establishedYear: z.number().int().min(1800).max(2100).nullable(),
  })
  .partial();
export type HospitalProfileFields = z.infer<typeof hospitalProfileFieldsSchema>;

const nonEmpty = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine((value) => Object.keys(value as object).length > 0, 'Change at least one field');

// ---- what a hospital submits ---------------------------------------------------------------------------------------
export const submitProfileEditSchema = z.object({
  fields: nonEmpty(hospitalProfileFieldsSchema),
  note: text(500).optional(),
  /** Super admins submit on a hospital's behalf; a hospital user's own hospital is used. */
  hospitalId: z.uuid().optional(),
});
export type SubmitProfileEdit = z.infer<typeof submitProfileEditSchema>;

export const submitPriceChangeSchema = z.object({
  packageId: z.uuid(),
  priceMinor: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  note: text(500).optional(),
});
export type SubmitPriceChange = z.infer<typeof submitPriceChangeSchema>;

export const submitOnboardingSchema = z.object({
  note: text(500).optional(),
  hospitalId: z.uuid().optional(),
});
export type SubmitOnboarding = z.infer<typeof submitOnboardingSchema>;

// ---- the review queue --------------------------------------------------------------------------------------------
const value = z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]);

export const changeRequestRowSchema = z.object({
  id: z.uuid(),
  kind: changeRequestKindSchema,
  status: changeRequestStatusSchema,
  hospitalId: z.uuid(),
  hospitalName: z.string().max(200),
  packageName: z.string().max(200).nullable(),
  changedFields: z.array(z.string().max(60)),
  submittedAt: z.iso.datetime(),
  submittedByName: z.string().max(200).nullable(),
  decidedAt: z.iso.datetime().nullable(),
});
export type ChangeRequestRow = z.infer<typeof changeRequestRowSchema>;

export const changeRequestListQuerySchema = z.object({
  status: changeRequestStatusSchema.optional(),
  kind: changeRequestKindSchema.optional(),
  hospitalId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(512).optional(),
});
export type ChangeRequestListQuery = z.infer<typeof changeRequestListQuerySchema>;
export const changeRequestPageSchema = cursorPageSchema(changeRequestRowSchema);

/** One field in the side-by-side view: what it held when submitted, what it holds now, and what is proposed. */
export const diffRowSchema = z.object({
  field: z.string().max(60),
  submitted: value,
  live: value,
  proposed: value,
  /** The live value moved on after the request was made, so the reviewer should look twice. */
  stale: z.boolean(),
});
export type DiffRow = z.infer<typeof diffRowSchema>;

export const changeRequestDetailSchema = changeRequestRowSchema.extend({
  note: z.string().max(500).nullable(),
  decisionReason: z.string().max(500).nullable(),
  decidedByName: z.string().max(200).nullable(),
  diff: z.array(diffRowSchema),
});
export type ChangeRequestDetail = z.infer<typeof changeRequestDetailSchema>;

export const rejectRequestSchema = z.object({ reason: text(500).min(5) });
export type RejectRequest = z.infer<typeof rejectRequestSchema>;

// ---- hospitals ---------------------------------------------------------------------------------------------------
export const hospitalRowSchema = z.object({
  id: z.uuid(),
  name: z.string().max(200),
  cityName: z.string().max(120),
  status: hospitalStatusSchema,
  agreementBp: z.number().int().nullable(),
  agreementEndsOn: z.iso.date().nullable(),
  pendingRequests: z.number().int().min(0),
});
export type HospitalRow = z.infer<typeof hospitalRowSchema>;
export const hospitalListQuerySchema = z.object({
  status: hospitalStatusSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(512).optional(),
});
export type HospitalListQuery = z.infer<typeof hospitalListQuerySchema>;
export const hospitalPageSchema = cursorPageSchema(hospitalRowSchema);

export const accreditationViewSchema = z.object({
  id: z.uuid(),
  body: accreditationBodySchema,
  certificateNo: z.string().max(120).nullable(),
  issuedAt: z.iso.date().nullable(),
  expiresAt: z.iso.date().nullable(),
  expired: z.boolean(),
  certificateId: z.uuid().nullable(),
  verifiedAt: z.iso.datetime().nullable(),
  verifiedByName: z.string().max(200).nullable(),
  verificationNote: z.string().max(500).nullable(),
});
export type AccreditationView = z.infer<typeof accreditationViewSchema>;

export const hospitalDetailSchema = hospitalRowSchema.extend({
  agreementStartsOn: z.iso.date().nullable(),
  agreementDocumentId: z.uuid().nullable(),
  accreditations: z.array(accreditationViewSchema),
  doctors: z.array(
    z.object({ id: z.uuid(), fullName: z.string().max(200), published: z.boolean() }),
  ),
  packages: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().max(200),
      priceMinor: z.number().int(),
      currency: z.string().length(3),
      active: z.boolean(),
      published: z.boolean(),
    }),
  ),
});
export type HospitalDetail = z.infer<typeof hospitalDetailSchema>;

const date = z.iso.date();
export const agreementSchema = z
  .object({
    agreementBp: z.number().int().min(0).max(10_000),
    startsOn: date,
    endsOn: date,
    /** An uploaded document of kind `agreement`, or null to unlink the current one. */
    documentId: z.uuid().nullable(),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    path: ['endsOn'],
    message: 'The agreement cannot end before it starts',
  });
export type AgreementInput = z.infer<typeof agreementSchema>;

export const verifyAccreditationSchema = z.object({
  verified: z.boolean(),
  note: text(500).optional(),
});
export type VerifyAccreditation = z.infer<typeof verifyAccreditationSchema>;

// ---- partner health ----------------------------------------------------------------------------------------------
export const partnerHealthSchema = z.object({
  accreditationExpiries: z.array(
    z.object({
      hospitalId: z.uuid(),
      hospitalName: z.string().max(200),
      accreditationId: z.uuid(),
      body: accreditationBodySchema,
      expiresAt: z.iso.date(),
      daysLeft: z.number().int(),
    }),
  ),
  agreementExpiries: z.array(
    z.object({
      hospitalId: z.uuid(),
      hospitalName: z.string().max(200),
      endsOn: z.iso.date(),
      daysLeft: z.number().int(),
    }),
  ),
  responseTimes: z.array(
    z.object({
      hospitalId: z.uuid(),
      hospitalName: z.string().max(200),
      months: z.array(
        z.object({
          month: z.string().regex(/^\d{4}-\d{2}$/),
          requests: z.number().int().min(0),
          answered: z.number().int().min(0),
          avgHours: z.number().min(0).max(1_000_000).nullable(),
        }),
      ),
    }),
  ),
});
export type PartnerHealth = z.infer<typeof partnerHealthSchema>;

/** A request to publish or unpublish: the same body for hospital, doctor and package. */
export const publishResultSchema = z.object({ id: z.uuid(), published: z.boolean() });
export type PublishResult = z.infer<typeof publishResultSchema>;

/** Days ahead the health view looks for expiring accreditations and agreements. */
export const EXPIRY_WINDOW_DAYS = 90;
