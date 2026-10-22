import { z } from 'zod';
import { roleSchema, type Role } from './roles.js';

/**
 * Authentication contracts (F-03): what the sign-in, 2FA, session and invitation endpoints accept and return,
 * and the rules about who needs a second factor and who may invite whom.
 */

// ---- who needs what ---------------------------------------------------------------------------------------------
/** Staff, hospital and admin users must use a second factor (PRD 12); patients and agents may. */
export const MANDATORY_TWO_FACTOR_ROLES = [
  'case_manager',
  'ground_coordinator',
  'interpreter',
  'medical_reviewer',
  'finance',
  'hospital_desk',
  'doctor',
  'super_admin',
] as const satisfies readonly Role[];

export const requiresTwoFactor = (role: Role): boolean =>
  (MANDATORY_TWO_FACTOR_ROLES as readonly Role[]).includes(role);

/** Roles that may sign in with an emailed or texted code instead of a password (people outside the company). */
export const OTP_LOGIN_ROLES = ['patient', 'attendant', 'agent'] as const satisfies readonly Role[];
export const canSignInWithOtp = (role: Role): boolean =>
  (OTP_LOGIN_ROLES as readonly Role[]).includes(role);

const STAFF_ROLES: Role[] = [
  'case_manager',
  'ground_coordinator',
  'interpreter',
  'medical_reviewer',
  'finance',
  'super_admin',
];
const HOSPITAL_ROLES: Role[] = ['hospital_desk', 'doctor'];

/** Who may invite which roles: the admin invites staff and hospital users, a hospital its own users, a patient attendants. */
export const INVITABLE_ROLES: Partial<Record<Role, readonly Role[]>> = {
  super_admin: [...STAFF_ROLES, ...HOSPITAL_ROLES],
  hospital_desk: HOSPITAL_ROLES,
  patient: ['attendant'],
};

export const canInvite = (inviter: Role, invited: Role): boolean =>
  (INVITABLE_ROLES[inviter] ?? []).includes(invited);

// ---- limits -----------------------------------------------------------------------------------------------------
export const AUTH_LIMITS = {
  /** Wrong passwords or codes in a row before the account is locked. */
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  accessTokenMinutes: 15,
  refreshTokenDays: 30,
  /** An idle session ends after this long without a refresh, even if the refresh token has not expired. */
  otpMinutes: 10,
  otpMaxAttempts: 5,
  emailVerificationHours: 48,
  passwordResetMinutes: 60,
  invitationDays: 7,
  magicLinkHours: 72,
  backupCodeCount: 10,
} as const;

// ---- field rules ------------------------------------------------------------------------------------------------
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'Enter the number with its country code, like +96812345678');
/** An email address or a phone number, for the sign-in code request. */
export const identifierSchema = z.union([emailSchema, phoneSchema]);

/** At least 10 characters with a letter and a digit. Length matters more than symbols (NIST 800-63B). */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a digit');

const nameSchema = z.string().trim().min(1, 'Required').max(120);
const tokenSchema = z.string().min(20).max(200);
/** A 6-digit authenticator or emailed code. */
export const sixDigitCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6 digits');
/** A backup code as printed: 10 letters and digits, optionally with a hyphen in the middle. */
export const backupCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/, 'Enter the backup code');

// ---- requests ---------------------------------------------------------------------------------------------------
export const registerSchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  language: z.enum(['en', 'ar']).default('en'),
});
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const otpRequestSchema = z.strictObject({ identifier: identifierSchema });
export const otpVerifySchema = z.strictObject({
  identifier: identifierSchema,
  code: sixDigitCodeSchema,
});
export const twoFactorChallengeSchema = z.strictObject({
  challengeToken: tokenSchema,
  code: z.union([sixDigitCodeSchema, backupCodeSchema]),
});
export const twoFactorEnableSchema = z.strictObject({ code: sixDigitCodeSchema });
export const twoFactorDisableSchema = z.strictObject({
  password: z.string().min(1).max(128),
  code: sixDigitCodeSchema,
});
export const forgotPasswordSchema = z.strictObject({ email: emailSchema });
export const resetPasswordSchema = z.strictObject({ token: tokenSchema, password: passwordSchema });
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export const verifyEmailSchema = z.strictObject({ token: tokenSchema });
export const createInvitationSchema = z.strictObject({
  email: emailSchema,
  name: nameSchema,
  role: roleSchema,
  /** The hospital a hospital user belongs to. A hospital desk invites into its own hospital and need not send it. */
  hospitalId: z.string().uuid().optional(),
});
export const acceptInvitationSchema = z.strictObject({
  token: tokenSchema,
  password: passwordSchema,
  name: nameSchema.optional(),
});
export const createMagicLinkSchema = z.strictObject({
  email: emailSchema,
  name: nameSchema,
  caseId: z.string().uuid(),
});
export const redeemMagicLinkSchema = z.strictObject({ token: tokenSchema });
export const sessionIdParamSchema = z.object({ id: z.string().uuid() });

// ---- responses --------------------------------------------------------------------------------------------------
export const authUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(120),
  email: z.string().max(254).nullable(),
  role: roleSchema,
  language: z.string().max(8),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  twoFactorRequired: z.boolean(),
  /** What the current session may do: `full`, or `two_factor_setup` / `two_factor_challenge` when it is limited. */
  access: z.enum(['full', 'two_factor_setup']),
  /** Set for a magic-link session: the one case it can see. */
  scopeCaseId: z.string().uuid().nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResultSchema = z.object({
  status: z.enum(['signed_in', 'two_factor_required']),
  /** Present when `status` is `two_factor_required`: send it back with the code. */
  challengeToken: z.string().max(200).nullable(),
  user: authUserSchema.nullable(),
});
export type LoginResult = z.infer<typeof loginResultSchema>;

export const twoFactorSetupSchema = z.object({
  /** The secret in base32, to type in by hand. */
  secret: z.string().max(100),
  otpauthUrl: z.string().max(500),
  /** An SVG image of the QR code, as a data URL. */
  qrCodeDataUrl: z.string().max(20000),
});
export const backupCodesSchema = z.object({ backupCodes: z.array(z.string().max(20)) });

export const sessionSchema = z.object({
  id: z.string().uuid(),
  deviceLabel: z.string().max(120).nullable(),
  ip: z.string().max(45).nullable(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionSchema>;
export const sessionListSchema = z.object({ items: z.array(sessionSchema) });

export const invitationPreviewSchema = z.object({
  email: z.string().max(254),
  name: z.string().max(120),
  role: roleSchema,
});
export const acceptedSchema = z.object({ ok: z.literal(true) });
